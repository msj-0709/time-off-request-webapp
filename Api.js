/**
 * ============================================
 * Api.gs - 웹앱(Index.html)에서 호출하는 서버 API
 * ============================================
 *
 * 클라이언트에서 google.script.run 으로 호출합니다.
 * 모든 함수의 첫 인자는 로그인 토큰(Auth.js)입니다.
 * (이름이 '_' 로 끝나는 함수는 클라이언트에서 호출 불가)
 *
 * 주의: google.script.run 은 Date 객체를 반환할 수 없으므로
 *       모든 날짜는 'yyyy-MM-dd' 문자열로 변환해서 내려줍니다.
 */

const LEAVE_SUB_TYPES = ["종일 연차", "오전 반차", "오후 반차"];
const DEFAULT_LEAVE_TYPES = "연차,경조휴가,병가,공가,기타";

/**
 * 앱 최초 로딩 시 필요한 모든 데이터
 */
function getBootstrap(token) {
  const ctx = _ctx_(token);
  const rows = ctx.manager.data;
  const holidays = _getHolidays_();
  const nameMap = _emailNameMap_(rows);

  const myName = nameMap[ctx.email] || "";
  const dtos = rows.map(r => _toDto_(r, holidays));

  const mine = dtos
    .filter(r => r.email === ctx.email)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const inbox = dtos
    .filter(r => r.state === STATES.PENDING && r.id &&
      (r.approver === ctx.email || ctx.isAdmin))
    .sort((a, b) => a.start.localeCompare(b.start));

  const fromDate = _fmt_(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const team = dtos
    .filter(r => (r.state === STATES.APPROVED || r.state === STATES.PENDING) && r.end >= fromDate)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(r => ({ name: r.name, type: r.type, sub: r.sub, start: r.start, end: r.end, state: r.state, days: r.days }));

  const pendingDays = mine
    .filter(r => r.state === STATES.PENDING && r.type === "연차")
    .reduce((s, r) => s + r.days, 0);

  return {
    user: { email: ctx.email, name: myName, isAdmin: ctx.isAdmin },
    approvers: _getApprovers_(rows, nameMap, ctx.email),
    leaveTypes: String(SETTINGS.LEAVE_TYPES || DEFAULT_LEAVE_TYPES).split(",").map(s => s.trim()).filter(Boolean),
    subTypes: LEAVE_SUB_TYPES,
    balance: _getBalance_(myName),
    pendingDays,
    holidays: Object.keys(holidays),
    mine,
    inbox,
    team,
    today: _fmt_(new Date())
  };
}

/**
 * 휴가 신청
 * @param {object} form {name, approver, start, end, type, sub, reason}
 */
function submitRequest(token, form) {
  const ctx = _ctx_(token);

  const name = String(form.name || "").trim();
  const approver = Utils.extractEmail(form.approver);
  const type = String(form.type || "").trim();
  let sub = String(form.sub || "").trim();
  const start = _parseDate_(form.start);
  const end = _parseDate_(form.end);

  if (!name) throw new Error("이름을 입력해 주세요.");
  if (!approver) throw new Error("승인자를 선택해 주세요.");
  if (approver.toLowerCase() === ctx.email) throw new Error("본인을 승인자로 지정할 수 없습니다.");
  if (!start || !end) throw new Error("휴가 기간을 입력해 주세요.");
  if (end < start) throw new Error("종료일이 시작일보다 빠릅니다.");
  if (!type) throw new Error("휴가 구분을 선택해 주세요.");

  if (type === "연차") {
    if (LEAVE_SUB_TYPES.indexOf(sub) < 0) throw new Error("연차 구분을 선택해 주세요.");
    if (sub !== "종일 연차" && start.getTime() !== end.getTime()) {
      throw new Error("반차는 하루만 신청할 수 있습니다.");
    }
  } else {
    sub = "해당 없음";
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const manager = new SheetManager(_getResponseSheet());

    // 본인 기존 신청과 기간 중복 체크
    const s = _fmt_(start), e = _fmt_(end);
    const overlap = manager.data.find(r =>
      String(r.이메일주소 || "").toLowerCase() === ctx.email &&
      (r.state === STATES.PENDING || r.state === STATES.APPROVED) &&
      _fmt_(r.휴가시작일자) <= e && _fmt_(r.휴가종료일자) >= s &&
      // 같은 날 오전/오후 반차는 허용
      !(String(r.연차구분).indexOf("반차") >= 0 && sub.indexOf("반차") >= 0 && r.연차구분 !== sub)
    );
    if (overlap) {
      throw new Error(`이미 같은 기간에 신청한 휴가가 있습니다 (${_fmt_(overlap.휴가시작일자)} ~ ${_fmt_(overlap.휴가종료일자)}).`);
    }

    const row = manager.appendRequest({
      이메일주소: ctx.email,
      요청자: name,
      승인자: approver,
      휴가시작일자: start,
      휴가종료일자: end,
      휴가구분: type,
      연차구분: sub,
      휴가사유: String(form.reason || "").trim()
    });

    Object.assign(row, SheetManager._buildApprovalUrls(row.identifier));
    row.appurl = CONFIG.WEB_APP_URL;
    EmailService.sendPendingEmail(row);

    writeToLog(`App Submitted: ${name} ${s}~${e}`);
  } finally {
    lock.releaseLock();
  }

  return getBootstrap(token);
}

/** 승인 (앱 내 승인함) */
function approveRequest(token, id) {
  return _decide_(token, id, STATES.APPROVED);
}

/** 반려 (앱 내 승인함) */
function denyRequest(token, id) {
  return _decide_(token, id, STATES.DENIED);
}

/**
 * 본인 신청 취소
 * - PENDING: 바로 취소
 * - APPROVED: 휴가 시작 전이면 캘린더 일정 삭제 후 취소
 */
function cancelRequest(token, id) {
  const ctx = _ctx_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const manager = new SheetManager(_getResponseSheet());
    const row = manager.findById(id);
    if (!row) throw new Error("해당 신청을 찾을 수 없습니다.");
    if (String(row.이메일주소 || "").toLowerCase() !== ctx.email && !ctx.isAdmin) {
      throw new Error("본인 신청만 취소할 수 있습니다.");
    }
    manager.cancel(id, ctx.email);
    writeToLog(`App Cancelled: ${row.요청자}`);
  } finally {
    lock.releaseLock();
  }
  return getBootstrap(token);
}

// ========== Private ==========

function _decide_(token, id, state) {
  const ctx = _ctx_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const manager = new SheetManager(_getResponseSheet());
    const row = manager.findById(id);
    if (!row) throw new Error("해당 신청을 찾을 수 없습니다.");

    const approver = (Utils.extractEmail(row.승인자) || "").toLowerCase();
    if (approver !== ctx.email && !ctx.isAdmin) {
      throw new Error("이 신청의 승인자가 아닙니다.");
    }

    if (state === STATES.APPROVED) manager.approve(id, ctx.email);
    else manager.deny(id, ctx.email);

    writeToLog(`App ${state}: ${row.요청자}`);
  } finally {
    lock.releaseLock();
  }
  return getBootstrap(token);
}

function _ctx_(token) {
  const email = _requireUser_(token);
  const admins = String(SETTINGS.ADMIN_EMAILS || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return {
    email,
    isAdmin: !!email && admins.indexOf(email) >= 0,
    manager: new SheetManager(_getResponseSheet())
  };
}

function _toDto_(r, holidays) {
  const start = _fmt_(r.휴가시작일자);
  const end = _fmt_(r.휴가종료일자);
  const sub = r.연차구분 ? String(r.연차구분) : "";
  return {
    id: r.identifier || "",
    name: String(r.요청자 || ""),
    email: String(r.이메일주소 || "").toLowerCase(),
    approver: (Utils.extractEmail(r.승인자) || "").toLowerCase(),
    start,
    end,
    type: String(r.휴가구분 || ""),
    sub,
    state: String(r.state || ""),
    actor: String(r.actor || ""),
    reason: String(r.휴가사유 || ""),
    createdAt: r.타임스탬프 instanceof Date
      ? Utilities.formatDate(r.타임스탬프, CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm") : "",
    days: _leaveDays_(start, end, sub, holidays)
  };
}

/** 연차 사용일수 계산 (반차 0.5, 그 외 주말·공휴일 제외 영업일) */
function _leaveDays_(start, end, sub, holidays) {
  if (!start || !end) return 0;
  if (sub.indexOf("반차") >= 0) return 0.5;
  let count = 0;
  const d = _parseDate_(start);
  const last = _parseDate_(end);
  while (d <= last) {
    const day = d.getDay();
    if (day !== 0 && day !== 6 && !holidays[_fmt_(d)]) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/** 이메일 → 이름 (가장 최근 신청 기준) */
function _emailNameMap_(rows) {
  const map = {};
  rows.forEach(r => {
    const email = String(r.이메일주소 || "").toLowerCase();
    if (email && r.요청자) map[email] = String(r.요청자).trim();
  });
  return map;
}

/**
 * 승인자 목록
 * __Settings 의 APPROVER_LIST (쉼표 구분 이메일)가 있으면 사용, 없으면 과거 승인자 목록
 */
function _getApprovers_(rows, nameMap, myEmail) {
  let emails = String(SETTINGS.APPROVER_LIST || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

  if (emails.length === 0) {
    const count = {};
    rows.forEach(r => {
      const e = (Utils.extractEmail(r.승인자) || "").toLowerCase();
      if (e) count[e] = (count[e] || 0) + 1;
    });
    emails = Object.keys(count).sort((a, b) => count[b] - count[a]);
  }

  return emails
    .filter(e => e !== myEmail)
    .map(e => ({ email: e, label: nameMap[e] ? `${nameMap[e]} (${e})` : e }));
}

/** 연차계산 시트에서 잔여 연차 읽기 (시트 수식 결과를 그대로 사용) */
function _getBalance_(name) {
  if (!name) return null;
  try {
    const sh = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEETS.BALANCE);
    if (!sh) return null;
    const values = sh.getDataRange().getValues();
    const hi = values.findIndex(r => r.some(v => String(v).trim() === "이름"));
    if (hi < 0) return null;

    const h = values[hi].map(v => String(v).trim());
    const col = k => h.indexOf(k);
    const r = values.slice(hi + 1).find(r => String(r[col("이름")]).trim() === name);
    if (!r) return null;

    const num = v => (typeof v === "number" ? v : Number(v) || 0);
    return {
      joinDate: _fmt_(r[col("입사일")]),
      tenure: String(r[col("근속년월일수")] || ""),
      granted: num(r[col("발생연차")]),
      used: num(r[col("사용연차")]),
      remaining: num(r[col("사용가능연차")])
    };
  } catch (e) {
    Logger.log(`⚠️ 잔여연차 조회 실패: ${e.message}`);
    return null;
  }
}

/** 데이터 시트의 공휴일 (E열) → { 'yyyy-MM-dd': true } */
function _getHolidays_() {
  const map = {};
  try {
    const sh = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEETS.HOLIDAYS);
    if (!sh || sh.getLastRow() < 3) return map;
    sh.getRange(3, 5, sh.getLastRow() - 2, 1).getValues().forEach(([v]) => {
      if (v instanceof Date) map[_fmt_(v)] = true;
    });
  } catch (e) {
    Logger.log(`⚠️ 공휴일 조회 실패: ${e.message}`);
  }
  return map;
}

function _fmt_(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (!(v instanceof Date) || isNaN(v.getTime())) return "";
  return Utilities.formatDate(v, CONFIG.TIMEZONE, "yyyy-MM-dd");
}

function _parseDate_(s) {
  if (s instanceof Date) return new Date(s.getTime());
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

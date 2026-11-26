/**
 * ============================================
 * Auth.gs - 이메일 인증코드 로그인
 * ============================================
 *
 * 구글 로그인 세션에 의존하지 않고, 회사 이메일로 받은 6자리 코드로 로그인합니다.
 * → 휴대폰에 구글 계정이 여러 개 있어도, 홈 화면 앱(별도 브라우저 환경)에서도 동작.
 *
 * - 인증코드: CacheService (10분 유효, 5회 실패 시 폐기, 60초 재발송 제한)
 * - 세션: PropertiesService 에 토큰 해시만 저장 (원본 토큰은 사용자 기기에만 존재)
 * - 사용할 때마다 유효기간 자동 연장 (하루 1회 갱신) → 자주 쓰면 로그인이 풀리지 않음
 * - 클라이언트는 토큰을 기기 저장소 + 페이지 주소(?t=)에 함께 보관
 *   → 홈 화면에 추가하면 아이콘 주소에 토큰이 포함되어, 아이폰 저장소가 지워져도 로그인 유지
 *
 * __Settings (선택)
 *   ALLOWED_EMAIL_DOMAINS : 로그인 허용 도메인 (쉼표 구분, 기본 j2db.co.kr)
 *   ALLOWED_EMAILS        : 도메인 외 개별 허용 이메일 (쉼표 구분)
 *   SESSION_DAYS          : 로그인 유지 일수 (기본 90)
 */

const AUTH = {
  CODE_TTL_SEC: 600,
  RESEND_WAIT_SEC: 60,
  MAX_ATTEMPTS: 5,
  DEFAULT_DOMAINS: "j2db.co.kr",
  DEFAULT_SESSION_DAYS: 90,
  SESSION_PREFIX: "sess_"
};

/**
 * 인증코드 메일 발송 (클라이언트 호출)
 */
function requestLoginCode(email) {
  email = String(email || "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(email) || Utils.extractEmail(email) !== email) {
    throw new Error("이메일 형식이 올바르지 않습니다.");
  }
  if (!_isAllowedEmail_(email)) {
    throw new Error("회사 이메일로만 로그인할 수 있습니다.");
  }

  const cache = CacheService.getScriptCache();
  const key = "otp_" + email;
  const prev = _json_(cache.get(key));
  const now = Date.now();
  if (prev && now - prev.sentAt < AUTH.RESEND_WAIT_SEC * 1000) {
    const wait = Math.ceil((AUTH.RESEND_WAIT_SEC * 1000 - (now - prev.sentAt)) / 1000);
    throw new Error(`${wait}초 후에 다시 요청해 주세요.`);
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put(key, JSON.stringify({ hash: _sha256_(email + ":" + code), tries: 0, sentAt: now }), AUTH.CODE_TTL_SEC);

  MailApp.sendEmail(email, `[휴가 신청] 로그인 인증코드 ${code}`, "", {
    htmlBody:
      `<div style="font-family:'Malgun Gothic',sans-serif;max-width:420px;padding:24px;border:1px solid #eee;border-radius:12px">` +
      `<h2 style="margin:0 0 12px">🌴 휴가 신청 로그인</h2>` +
      `<p>아래 인증코드를 앱에 입력해 주세요. (10분간 유효)</p>` +
      `<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>` +
      `<p style="color:#888;font-size:13px">본인이 요청하지 않았다면 이 메일을 무시하세요.</p></div>`
  });

  writeToLog(`Login code sent: ${email}`);
  return { ok: true };
}

/**
 * 인증코드 확인 → 세션 토큰 발급 (클라이언트 호출)
 */
function verifyLoginCode(email, code) {
  email = String(email || "").trim().toLowerCase();
  code = String(code || "").replace(/\D/g, "");

  const cache = CacheService.getScriptCache();
  const key = "otp_" + email;
  const entry = _json_(cache.get(key));
  if (!entry) throw new Error("인증코드가 만료되었습니다. 다시 요청해 주세요.");

  if (entry.hash !== _sha256_(email + ":" + code)) {
    entry.tries++;
    if (entry.tries >= AUTH.MAX_ATTEMPTS) {
      cache.remove(key);
      throw new Error("인증 실패 횟수를 초과했습니다. 코드를 다시 요청해 주세요.");
    }
    cache.put(key, JSON.stringify(entry), AUTH.CODE_TTL_SEC);
    throw new Error(`인증코드가 올바르지 않습니다. (${AUTH.MAX_ATTEMPTS - entry.tries}회 남음)`);
  }
  cache.remove(key);

  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  const days = Number(SETTINGS.SESSION_DAYS) || AUTH.DEFAULT_SESSION_DAYS;
  const props = PropertiesService.getScriptProperties();
  _cleanupSessions_(props);
  props.setProperty(AUTH.SESSION_PREFIX + _sha256_(token),
    JSON.stringify({ email, exp: Date.now() + days * 86400000 }));

  writeToLog(`Login: ${email}`);
  return { token, email };
}

/**
 * 로그아웃 (클라이언트 호출)
 */
function logout(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty(AUTH.SESSION_PREFIX + _sha256_(String(token)));
  return { ok: true };
}

/**
 * 토큰 → 이메일. 유효하지 않으면 AUTH_REQUIRED 에러
 */
function _requireUser_(token) {
  if (token) {
    const props = PropertiesService.getScriptProperties();
    const key = AUTH.SESSION_PREFIX + _sha256_(String(token));
    const sess = _json_(props.getProperty(key));
    if (sess && sess.exp > Date.now() && _isAllowedEmail_(sess.email)) {
      _renewSession_(props, key, sess);
      return sess.email;
    }
    if (sess) props.deleteProperty(key);
  }
  throw new Error("AUTH_REQUIRED");
}

/**
 * 사용 시 유효기간 연장 (속성 쓰기를 줄이기 위해 하루에 한 번만)
 */
function _renewSession_(props, key, sess) {
  const days = Number(SETTINGS.SESSION_DAYS) || AUTH.DEFAULT_SESSION_DAYS;
  const newExp = Date.now() + days * 86400000;
  if (newExp - sess.exp < 86400000) return;
  sess.exp = newExp;
  try { props.setProperty(key, JSON.stringify(sess)); } catch (e) { Logger.log(`세션 연장 실패: ${e.message}`); }
}

/**
 * 모든 기기에서 로그아웃 (클라이언트 호출) - 홈 화면 아이콘 주소가 유출됐을 때 사용
 */
function logoutAllDevices(token) {
  const email = _requireUser_(token);
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(k => {
    if (k.indexOf(AUTH.SESSION_PREFIX) !== 0) return;
    const s = _json_(all[k]);
    if (!s || s.email === email) props.deleteProperty(k);
  });
  writeToLog(`Logout all devices: ${email}`);
  return { ok: true };
}

function _isAllowedEmail_(email) {
  const domains = String(SETTINGS.ALLOWED_EMAIL_DOMAINS || AUTH.DEFAULT_DOMAINS)
    .split(",").map(s => s.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  const extras = String(SETTINGS.ALLOWED_EMAILS || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const domain = email.split("@")[1] || "";
  return domains.indexOf(domain) >= 0 || extras.indexOf(email) >= 0;
}

function _cleanupSessions_(props) {
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(k => {
    if (k.indexOf(AUTH.SESSION_PREFIX) !== 0) return;
    const s = _json_(all[k]);
    if (!s || s.exp < now) props.deleteProperty(k);
  });
}

function _sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");
}

function _json_(s) {
  try { return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

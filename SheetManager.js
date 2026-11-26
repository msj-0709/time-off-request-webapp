/**
 * ============================================
 * SheetManager.gs - 시트 데이터 관리
 * ============================================
 *
 * 스프레드시트 읽기/쓰기 담당
 */

class SheetManager {

  /**
   * @param {Sheet} sheet - Google Sheet 객체
   */
  constructor(sheet) {
    this.sheet = sheet;
    this.REQUIRED_COLUMNS = ['state', 'actor', 'identifier', 'eventId', '휴가사유'];
    
    // 시트 전체를 한 번에 읽어 헤더/데이터를 만든다 (왕복 호출 최소화)
    let values = this._readAll();
    if (this._ensureRequiredColumns(values[0] || [])) values = this._readAll();
    this.headers = (values[0] || []).map(h => Utils.normalizeHeader(h));
    this.data = values.slice(1).map((row, i) => {
      const obj = { __row: i + 2 };
      this.headers.forEach((key, j) => {
        if (key) obj[key] = row[j];
      });
      return obj;
    });

    Logger.log(`SheetManager 초기화 - ${this.data.length}행 로드됨`);
  }

  // ========== Public 메서드 ==========

  /**
   * 신규 항목 처리 (state가 없는 행 → PENDING)
   */
  processNewEntries() {
    Logger.log("신규 항목 처리 시작");

    this.data
      .filter(row => !row.state)
      .forEach(row => this._setToPending(row));
  }

  /**
   * 승인 처리
   *
   * @param {string} uuid - 식별자
   * @param {string} actorEmail - 승인자 이메일
   */
  approve(uuid, actorEmail) {
    const row = this._findByUuid(uuid);

    if (!row) {
      throw new Error("해당 데이터를 찾을 수 없습니다.");
    }
    if (row.state === STATES.APPROVED) {
      throw new Error("이미 승인된 건입니다.");
    }
    if (row.state === STATES.DENIED) {
      throw new Error("이미 반려된 건입니다.");
    }

    row.state = STATES.APPROVED;
    row.actor = actorEmail || Utils.extractEmail(row.승인자) || "";
    
    // 연차구분 처리
    if (row.휴가구분 !== "연차") {
      row.연차구분 = "해당 없음";
    } else {
      row.연차구분 = row.연차구분 || "종일 연차";
    }

    // 승인 메일 (신청자에게)
    EmailService.sendApprovalEmail(row);

    // 캘린더 이벤트 생성
    if (SETTINGS.CREATE_CALENDAR_EVENT == "1") {
      const eventId = CalendarService.createEvent(row);
      if (eventId) {
        row.eventId = eventId;   // 아래 _saveRow 에서 함께 저장
      }
    }

    // 시트 저장
    this._saveRow(row);

    // 전사 공지 메일 (@j2db.co.kr 전 직원)
    EmailService.sendAnnouncementEmail(row);

    Logger.log(`✅ 승인 완료: ${row.__row}행`);
  }

  /**
   * 반려 처리
   *
   * @param {string} uuid - 식별자
   * @param {string} actorEmail - 반려자 이메일
   */
  deny(uuid, actorEmail) {
    const row = this._findByUuid(uuid);

    if (!row) {
      throw new Error("해당 데이터를 찾을 수 없습니다.");
    }
    if (row.state === STATES.DENIED) {
      throw new Error("이미 반려된 건입니다.");
    }
    if (row.state === STATES.APPROVED) {
      throw new Error("이미 승인된 건입니다.");
    }

    row.state = STATES.DENIED;
    row.actor = actorEmail || Utils.extractEmail(row.승인자) || "";
    
    // 반려 메일 발송
    EmailService.sendDenialEmail(row);
    this._saveRow(row);

    Logger.log(`❌ 반려 완료: ${row.__row}행`);
  }
  
  /**
   * 앱에서 신청한 휴가를 새 행으로 추가 (PENDING 상태)
   *
   * @param {object} values - 정규화된 헤더명 → 값
   * @returns {object} 추가된 행 데이터
   */
  appendRequest(values) {
    const row = Object.assign({
      타임스탬프: new Date(),
      state: STATES.PENDING,
      identifier: Utils.generateUUID(),
      actor: "",
      eventId: ""
    }, values);

    const arr = this.headers.map(h => (h && row[h] !== undefined ? row[h] : ""));
    this.sheet.appendRow(arr);

    // 락을 잡은 상태에서 읽은 마지막 행 다음 줄 (getLastRow 재호출 없이)
    row.__row = this.data.length + 2;
    this.data.push(row);
    Logger.log(`📝 앱 신청 추가: ${row.__row}행`);
    return row;
  }

  /**
   * identifier 로 행 찾기
   */
  findById(uuid) {
    return this._findByUuid(uuid);
  }

  /**
   * 취소 처리
   * - PENDING: 바로 취소
   * - APPROVED: 휴가 시작 전이면 캘린더 일정 삭제 후 취소
   */
  cancel(uuid, actorEmail) {
    const row = this._findByUuid(uuid);
    if (!row) throw new Error("해당 데이터를 찾을 수 없습니다.");

    if (row.state === STATES.APPROVED) {
      const start = Utils.toDate(row.휴가시작일자);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (!start || start < today) {
        throw new Error("이미 시작된 휴가는 취소할 수 없습니다. 관리자에게 문의하세요.");
      }
      if (row.eventId) CalendarService.deleteEvent(row);
    } else if (row.state !== STATES.PENDING) {
      throw new Error("대기 또는 승인 상태의 신청만 취소할 수 있습니다.");
    }

    row.state = STATES.CANCELLED;
    row.actor = actorEmail || Utils.extractEmail(row.승인자) || "";
    EmailService.sendCancellationEmail(row);
    this._saveRow(row);
    Logger.log(`🚫 취소 완료: ${row.__row}행`);
  }

  // ========== Static 메서드 ==========

  /**
   * 승인/반려 URL 생성
   *
   * @param {string} identifier - 행 식별자 (UUID)
   * @returns {{ approvalurl: string, denyurl: string }}
   */
  static _buildApprovalUrls(identifier) {
    return {
      approvalurl: `${CONFIG.WEB_APP_URL}?i=${identifier}&state=${STATES.APPROVED}`,
      denyurl: `${CONFIG.WEB_APP_URL}?i=${identifier}&state=${STATES.DENIED}`
    };
  }

  // ========== Private 메서드 ==========

  /**
   * 시트 전체 값 (1회 호출)
   */
  _readAll() {
    return this.sheet.getDataRange().getValues();
  }

  /**
   * 필수 컬럼이 없으면 자동 생성
   *
   * @param {Array} headerRow - 1행 값
   * @returns {boolean} 컬럼을 추가했으면 true (다시 읽어야 함)
   */
  _ensureRequiredColumns(headerRow) {
    const existingHeaders = headerRow.map(h => h.toString().trim());
    const missing = this.REQUIRED_COLUMNS.filter(col => !existingHeaders.includes(col));
    if (missing.length === 0) return false;

    let newCol = this.sheet.getLastColumn() + 1;
    missing.forEach(col => {
      this.sheet.getRange(1, newCol++).setValue(col);
      Logger.log(`✅ 컬럼 자동 생성: ${col}`);
    });
    return true;
  }

  /**
   * 헤더 로드 및 정규화
   */
  _loadHeaders() {
    const lastCol = this.sheet.getLastColumn();
    if (lastCol === 0) return [];

    const values = this.sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    return values.map(h => Utils.normalizeHeader(h));
  }

  /**
   * 데이터 로드 (2행부터)
   */
  _loadData() {
    const lastRow = this.sheet.getLastRow();
    if (lastRow < 2) return [];

    const values = this.sheet.getRange(2, 1, lastRow - 1, this.sheet.getLastColumn()).getValues();

    return values.map((row, i) => {
      const obj = { __row: i + 2 };

      this.headers.forEach((key, j) => {
        if (key) obj[key] = row[j];
      });

      return obj;
    });
  }

  /**
   * UUID로 행 찾기
   */
  _findByUuid(uuid) {
    return this.data.find(row => row.identifier === uuid);
  }

  /**
   * PENDING 상태로 설정 + 승인자에게 메일 발송
   */
  _setToPending(row) {
    Logger.log(`PENDING 처리: ${row.__row}행`);

    row.state = STATES.PENDING;
    row.identifier = Utils.generateUUID();

    // URL 생성 (static 메서드로 단일화)
    const urls = SheetManager._buildApprovalUrls(row.identifier);
    row.approvalurl = urls.approvalurl;
    row.denyurl = urls.denyurl;

    EmailService.sendPendingEmail(row);
    this._saveRow(row);
  }

  /**
   * 행 데이터를 시트에 저장
   */
  _saveRow(row) {
    const stateCol = this.headers.indexOf("state") + 1;
    const actorCol = this.headers.indexOf("actor") + 1;
    const idCol = this.headers.indexOf("identifier") + 1;
    const eventCol = this.headers.indexOf("eventId") + 1;

    // 저장할 컬럼들이 서로 붙어 있으면 한 번에 쓰기 (왕복 호출 1회)
    const fields = { state: row.state, actor: row.actor || "", identifier: row.identifier || "" };
    if (row.eventId) fields.eventId = row.eventId;
    const cols = Object.keys(fields).map(k => this.headers.indexOf(k) + 1);
    if (cols.every(c => c > 0)) {
      const min = Math.min.apply(null, cols), max = Math.max.apply(null, cols);
      if (max - min + 1 === cols.length) {
        const line = [];
        for (let c = min; c <= max; c++) line.push(fields[this.headers[c - 1]]);
        this.sheet.getRange(row.__row, min, 1, line.length).setValues([line]);
        Logger.log(`시트 저장: ${row.__row}행, state=${row.state}`);
        return;
      }
    }

    if (row.eventId && eventCol) {
      this.sheet.getRange(row.__row, eventCol).setValue(row.eventId);
    }
    if (stateCol) {
      this.sheet.getRange(row.__row, stateCol).setValue(row.state);
    }
    if (actorCol) {
      this.sheet.getRange(row.__row, actorCol).setValue(row.actor || "");
    }
    if (idCol) {
      this.sheet.getRange(row.__row, idCol).setValue(row.identifier || "");
    }

    Logger.log(`시트 저장: ${row.__row}행, state=${row.state}`);
  }

  /**
   * eventId 저장
   */
  _saveEventId(rowNum, eventId) {
    const eventIdCol = this.headers.indexOf("eventId") + 1;

    if (eventIdCol) {
      this.sheet.getRange(rowNum, eventIdCol).setValue(eventId);
    }
  }
}

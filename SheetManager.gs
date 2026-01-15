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
    this.REQUIRED_COLUMNS = ['state', 'actor', 'identifier', 'eventId'];
    
    this._ensureRequiredColumns();  // 필수 컬럼 자동 생성
    this.headers = this._loadHeaders();
    this.data = this._loadData();
    
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
    
    // 상태 업데이트
    row.state = STATES.APPROVED;
    row.actor = actorEmail;
    
    // 연차구분 처리
    if (row.휴가구분 !== "연차") {
      row.연차구분 = "해당 없음";
    } else {
      row.연차구분 = row.연차구분 || "종일연차";
    }
    
    // 승인 메일 발송
    EmailService.sendApprovalEmail(row);
    
    // 캘린더 이벤트 생성
    if (SETTINGS.CREATE_CALENDAR_EVENT == "1") {
      const eventId = CalendarService.createEvent(row);
      if (eventId) {
        this._saveEventId(row.__row, eventId);
      }
    }
    
    // 시트 저장
    this._saveRow(row);
    
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
    
    // 상태 업데이트
    row.state = STATES.DENIED;
    row.actor = actorEmail;
    
    // 반려 메일 발송
    EmailService.sendDenialEmail(row);
    
    // 시트 저장
    this._saveRow(row);
    
    Logger.log(`❌ 반려 완료: ${row.__row}행`);
  }
  
  // ========== Private 메서드 ==========
  
  /**
   * 필수 컬럼이 없으면 자동 생성
   */
  _ensureRequiredColumns() {
    const lastCol = this.sheet.getLastColumn();
    const existingHeaders = lastCol > 0 
      ? this.sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim())
      : [];
    
    this.REQUIRED_COLUMNS.forEach(col => {
      if (!existingHeaders.includes(col)) {
        const newCol = this.sheet.getLastColumn() + 1;
        this.sheet.getRange(1, newCol).setValue(col);
        Logger.log(`✅ 컬럼 자동 생성: ${col}`);
      }
    });
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
    
    // 상태 및 식별자 설정
    row.state = STATES.PENDING;
    row.identifier = Utils.generateUUID();
    
    // 승인/반려 URL 생성
    row.approvalurl = `${CONFIG.WEB_APP_URL}?i=${row.identifier}&state=${STATES.APPROVED}`;
    row.denyurl = `${CONFIG.WEB_APP_URL}?i=${row.identifier}&state=${STATES.DENIED}`;
    
    // 승인자에게 메일 발송
    EmailService.sendPendingEmail(row);
    
    // 시트 저장
    this._saveRow(row);
  }
  
  /**
   * 행 데이터를 시트에 저장
   */
  _saveRow(row) {
    const stateCol = this.headers.indexOf("state") + 1;
    const actorCol = this.headers.indexOf("actor") + 1;
    const idCol = this.headers.indexOf("identifier") + 1;
    
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

/**
 * ============================================
 * CalendarService.gs - 캘린더 관리
 * ============================================
 * 
 * 캘린더 이벤트 생성/삭제 감지 담당
 */

const CalendarService = {
  
  /**
   * 캘린더 이벤트 생성
   * 
   * @param {object} row - 행 데이터
   * @returns {string|null} 생성된 이벤트 ID
   */
  createEvent(row) {
    const start = Utils.toDate(row.휴가시작일자 || row.leaveStartDate);
    const end = Utils.toDate(row.휴가종료일자 || row.lastDayOfLeave);
    
    if (!start || !end) {
      Logger.log("⚠️ 캘린더 생성 실패: 날짜 없음");
      return null;
    }
    
    const calendar = this._getCalendar(row);
    
    if (!calendar) {
      Logger.log("⚠️ 캘린더를 찾을 수 없습니다.");
      return null;
    }
    
    // 종료일 +1 (종일 이벤트는 종료일 다음날까지)
    const adjEnd = new Date(end);
    adjEnd.setDate(adjEnd.getDate() + 1);
    
    try {
      const event = calendar.createAllDayEvent(
        Utils.processTemplate(SETTINGS.CALENDAR_EVENT_TITLE, row),
        start,
        adjEnd,
        {
          description: Utils.processTemplate(SETTINGS.CALENDAR_EVENT_DESCRIPTION, row),
          location: Utils.processTemplate(SETTINGS.CALENDAR_EVENT_LOCATION, row),
          guests: row.승인자 || ""  // ✅ 승인자 이메일로 변경
        } 
      );
      
      Logger.log(`📅 캘린더 이벤트 생성 완료: ${event.getId()}`);
      return event.getId();
      
    } catch (e) {
      Logger.log(`❌ 캘린더 생성 실패: ${e.message}`);
      return null;
    }
  },
  
  /**
   * 캘린더 이벤트 삭제 여부 확인
   * 
   * @param {string} eventId - 이벤트 ID
   * @returns {boolean} 삭제되었으면 true
   */
  isEventDeleted(eventId) {
    const calendar = this._getGroupCalendar();
    
    if (!calendar || !eventId) {
      return false;
    }
    
    const event = calendar.getEventById(eventId);
    
    // 이벤트가 없으면 삭제됨
    if (!event) {
      return true;
    }
    
    // 제목이 없거나 날짜가 이상하면 삭제됨
    const title = event.getTitle();
    const startYear = event.getStartTime().getFullYear();
    
    if (!title || startYear < 2001) {
      return true;
    }
    
    // 해당 날짜에 실제로 이벤트가 있는지 확인
    const startTime = event.getStartTime();
    const events = calendar.getEventsForDay(startTime);
    const found = events.some(ev => ev.getId() === eventId);
    
    return !found;
  },
  
  // ========== Private 메서드 ==========
  
  /**
   * 캘린더 객체 가져오기
   */
  _getCalendar(row) {
    const calendarId = (SETTINGS.WRITE_TO_GROUP_CALENDAR == "1")
      ? SETTINGS.GROUP_CALENDAR_ID
      : (row.이메일주소 || "primary");
    
    return CalendarApp.getCalendarById(calendarId) || CalendarApp.getDefaultCalendar();
  },
  
  /**
   * 그룹 캘린더 가져오기
   */
  _getGroupCalendar() {
    return CalendarApp.getCalendarById(SETTINGS.GROUP_CALENDAR_ID);
  }
};

/**
 * 캘린더 변경 감지 (트리거용)
 * 
 * @param {object} e - 이벤트 객체
 */
function onCalendarChange(e) {
  Logger.log("=== 캘린더 변경 감지 ===");
  
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.RESPONSES);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // 컬럼 인덱스 찾기
  const eventIdCol = headers.findIndex(h => h.toString().includes('eventId')) + 1;
  const stateCol = headers.findIndex(h => h.toString().includes('state')) + 1;
  
  if (!eventIdCol || !stateCol) {
    Logger.log("⚠️ 필수 컬럼(eventId, state)이 없습니다.");
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  
  // 각 행 확인
  data.slice(1).forEach((row, i) => {
    const rowNum = i + 2;
    const eventId = row[eventIdCol - 1];
    const currentState = row[stateCol - 1];
    
    // APPROVED 상태이고 eventId가 있는 경우만 체크
    if (eventId && currentState === STATES.APPROVED) {
      
      if (CalendarService.isEventDeleted(eventId)) {
        sheet.getRange(rowNum, stateCol).setValue(STATES.CANCELLED);
        Logger.log(`✅ ${rowNum}행: ${STATES.CANCELLED}로 변경!`);
      }
    }
  });
}
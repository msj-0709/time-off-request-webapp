/**
 * ============================================
 * Main.gs - 메인 진입점
 * ============================================
 * 
 * 외부에서 호출되는 함수들 (트리거, 웹앱 등)
 */

/**
 * 웹앱 진입점 (GET 요청)
 * 
 * - 파라미터 없음: 구글 폼으로 리다이렉트
 * - 파라미터 있음: 승인/반려 처리
 */
function doGet(e) {
  // 파라미터 없으면 구글 폼으로 이동
  if (!e.parameter || !e.parameter.i) {
    return createRedirectPage(CONFIG.GOOGLE_FORM_URL);
  }
  
  // 승인/반려 처리
  const { i: uuid, state } = e.parameter;
  const user = Session.getEffectiveUser().getEmail();
  
  try {
    const sheet = _getResponseSheet();
    const manager = new SheetManager(sheet);
    
    if (state === STATES.APPROVED) {
      manager.approve(uuid, user);
      return createApprovalPage('✅', '승인이 완료되었습니다', '#1e8e3e');
      
    } else if (state === STATES.DENIED) {
      manager.deny(uuid, user);
      return createApprovalPage('❌', '반려 처리가 완료되었습니다', '#d93025');
      
    } else {
      throw new Error("잘못된 요청 상태입니다.");
    }
    
  } catch (err) {
    Logger.log(`❌ 에러: ${err.message}`);
    return createErrorPage(err.message);
  }
}

/**
 * 폼 제출 트리거
 */
function onFormSubmit(e) {
  Logger.log("=== 폼 제출 처리 시작 ===");
  
  try {
    // 트리거에서는 getActiveSpreadsheet() 사용
    const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.RESPONSES);
    
    if (!sheet) {
      throw new Error(`'${CONFIG.SHEETS.RESPONSES}' 시트를 찾을 수 없습니다.`);
    }
    
    const lastRow = sheet.getLastRow();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // 이메일 자동 입력 (폼에서 수집된 이메일)
    const emailCol = headers.findIndex(h => h.toString().includes('이메일')) + 1;
    let email = null;
    
    // 폼 응답에서 이메일 가져오기
    if (e && e.response) {
      email = e.response.getRespondentEmail();
    } else if (e && e.namedValues && e.namedValues['이메일 주소']) {
      email = e.namedValues['이메일 주소'][0];
    } else {
      email = Session.getActiveUser().getEmail();
    }
    
    if (emailCol && email && !sheet.getRange(lastRow, emailCol).getValue()) {
      sheet.getRange(lastRow, emailCol).setValue(email);
      Logger.log(`이메일 자동 입력: ${email}`);
    }
    
    // 신규 항목 처리 (PENDING으로 변경 + 승인자에게 메일)
    new SheetManager(sheet).processNewEntries();
    
    writeToLog("Form Submitted");
    Logger.log("=== 폼 제출 처리 완료 ===");
    
  } catch (err) {
    Logger.log(`❌ 폼 제출 에러: ${err.message}`);
    Logger.log(err.stack);
  }
}

/**
 * Google Workspace Add-on 홈페이지
 */
function onHomepage(e) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("HR System"))
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextParagraph()
            .setText("인사관리 시스템에 오신 것을 환영합니다.")
        )
    )
    .build();
}

// ========== Private 함수 ==========

/**
 * 응답 시트 가져오기
 */
function _getResponseSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.RESPONSES);
  
  if (!sheet) {
    throw new Error(`'${CONFIG.SHEETS.RESPONSES}' 시트를 찾을 수 없습니다.`);
  }
  
  return sheet;
}

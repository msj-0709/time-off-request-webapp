/**
 * ============================================
 * Config.gs - 설정값 관리
 * ============================================
 * 
 * 모든 설정값을 한 곳에서 관리합니다.
 * 수정이 필요하면 이 파일만 수정하세요.
 */

const CONFIG = {
  // 스프레드시트 설정
  SPREADSHEET_ID: "",
  
  // 시트 이름
  SHEETS: {
    RESPONSES: "휴가요청내역",
    LOG: "Execution Log",
    SETTINGS: "__Settings"
  },
  
  // 시간대
  TIMEZONE: "Asia/Seoul",
  
  // 웹앱 URL (배포 후 업데이트 필요)
  WEB_APP_URL: "",
  
  // 구글 폼 URL
  GOOGLE_FORM_URL: ""
};

// 상태값 정의

const STATES = {
  PENDING: "PENDING",
  APPROVED: "APPROVED", 
  DENIED: "DENIED",
  CANCELLED: "CANCELLED"
};

// 이메일 정규식
const EMAIL_REGEX = /[a-zA-Z+0-9\.-]+@[a-zA-Z0-9\.-]+/i;

/**
 * __Settings 시트에서 설정값 로드
 */
function loadSettings() {
  const settings = {};
  
  try {
    const sheet = SpreadsheetApp
      .openById(CONFIG.SPREADSHEET_ID)
      .getSheetByName(CONFIG.SHEETS.SETTINGS);
    
    const data = sheet.getDataRange().getValues();
    
    data.slice(1).forEach(row => {
      if (row[0]) settings[row[0]] = row[1];
    });
    
  } catch (e) {
    Logger.log(`⚠️ 설정 로드 실패: ${e.message}`);
  }
  
  return settings;
}

// 전역 설정 객체
const SETTINGS = loadSettings();

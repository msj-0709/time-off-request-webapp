/**
 * ============================================
 * Config.gs - 설정값 관리
 * ============================================
 *
 * 모든 설정값을 한 곳에서 관리합니다.
 *
 * [보안] SPREADSHEET_ID는 Apps Script 편집기 →
 *        프로젝트 설정 → 스크립트 속성에서 관리합니다.
 *        키: SPREADSHEET_ID, 값: 스프레드시트 ID
 */

const CONFIG = {
  // [보안] PropertiesService에서 로드. 미설정 시 fallback 사용
  SPREADSHEET_ID: PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
    || "1rQVXmDmWGFQ2j0LvSBxiJMXEVlWJBhaFaqSpcP2tVME",

  // 시트 이름
  SHEETS: {
    RESPONSES: "휴가요청내역",
    LOG: "Execution Log",
    SETTINGS: "__Settings",
    BALANCE: "연차계산",
    HOLIDAYS: "데이터"
  },

  // 시간대
  TIMEZONE: "Asia/Seoul",

  // 웹앱 URL (배포 후 업데이트 필요)
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbzVg3ko1cP9ruzNhKiexTwrmqmEzkGG1myQRiz4X2h4-tmKlIPj1WEA-PE5wHfS4935EQ/exec",

  // 구글 폼 URL
  GOOGLE_FORM_URL: "https://docs.google.com/forms/d/e/1FAIpQLScS7vrwfVSWSnJazy9_aHpPTdnOJvNH6TIX6EW8l-SDVk_7pw/viewform",

  // 전사 공지 발송 도메인
  ANNOUNCEMENT_DOMAIN: "j2db.co.kr"
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
 * 스프레드시트 객체 (한 번의 실행 안에서 재사용 → openById 반복 호출 방지)
 */
function getSpreadsheet_() {
  if (!getSpreadsheet_.ss) getSpreadsheet_.ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  return getSpreadsheet_.ss;
}

/**
 * 시트 가져오기 (실행 안에서 재사용)
 */
function getSheet_(name) {
  const cache = getSheet_.cache || (getSheet_.cache = {});
  if (!(name in cache)) cache[name] = getSpreadsheet_().getSheetByName(name);
  return cache[name];
}

/** 설정 캐시 유지 시간(초). __Settings 시트 수정은 최대 이 시간 뒤 반영 */
const SETTINGS_CACHE_SEC = 600;

/**
 * __Settings 시트에서 설정값 로드 (10분 캐시)
 */
function loadSettings() {
  try {
    const cached = CacheService.getScriptCache().get("settings_v1");
    if (cached) return JSON.parse(cached);
  } catch (e) {
    Logger.log(`설정 캐시 읽기 실패: ${e.message}`);
  }

  const settings = {};

  try {
    const sheet = getSheet_(CONFIG.SHEETS.SETTINGS);

    if (!sheet) {
      Logger.log(`⚠️ [loadSettings] '${CONFIG.SHEETS.SETTINGS}' 시트가 없습니다. 이메일 템플릿이 동작하지 않을 수 있습니다.`);
      return settings;
    }

    const data = sheet.getDataRange().getValues();

    data.slice(1).forEach(row => {
      if (row[0]) settings[row[0]] = row[1];
    });

    if (Object.keys(settings).length === 0) {
      Logger.log(`⚠️ [loadSettings] '${CONFIG.SHEETS.SETTINGS}' 시트에 설정값이 없습니다.`);
    } else {
      Logger.log(`✅ [loadSettings] ${Object.keys(settings).length}개 설정값 로드 완료`);
      try {
        const json = JSON.stringify(settings);
        if (json.length < 90000) CacheService.getScriptCache().put("settings_v1", json, SETTINGS_CACHE_SEC);
      } catch (e) {
        Logger.log(`설정 캐시 저장 실패: ${e.message}`);
      }
    }

  } catch (e) {
    Logger.log(`⚠️ 설정 로드 실패: ${e.message}`);
  }

  return settings;
}

// 전역 설정 객체
const SETTINGS = loadSettings();

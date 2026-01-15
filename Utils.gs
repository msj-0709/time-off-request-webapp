/**
 * ============================================
 * Utils.gs - 유틸리티 함수
 * ============================================
 * 
 * 여러 곳에서 사용되는 공통 함수들
 */

const Utils = {
  
  /**
   * UUID 생성
   */
  generateUUID() {
    return Utilities.getUuid();
  },
  
  /**
   * 템플릿 문자열 처리
   * {{변수명}} 형태를 실제 값으로 치환
   * 
   * @param {string} template - 템플릿 문자열
   * @param {object} data - 치환할 데이터
   * @returns {string} 치환된 문자열
   */
  processTemplate(template, data) {
    if (!template) return "";
    
    return template.replace(/\{\{(.*?)\}\}/g, (match, key) => {
      const cleanKey = key.trim().replace(/\s+/g, "");
      const value = data[cleanKey];
      
      if (value instanceof Date) {
        return Utilities.formatDate(value, CONFIG.TIMEZONE, "yyyy-MM-dd");
      }
      
      return value !== undefined && value !== null ? value : match;
    });
  },
  
  /**
   * 값을 Date 객체로 변환
   * 
   * @param {any} val - 변환할 값
   * @returns {Date|null} Date 객체 또는 null
   */
  toDate(val) {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  },
  
  /**
   * 헤더 문자열 정규화
   * 괄호, 콜론, 공백 제거
   * 
   * @param {string} header - 헤더 문자열
   * @returns {string} 정규화된 문자열
   */
  normalizeHeader(header) {
    return header.toString()
      .split('(')[0]
      .replace(/[:：]/g, "")
      .replace(/\s+/g, "")
      .trim();
  },
  
  /**
   * 객체에서 특정 키워드를 포함하는 키 찾기
   * 
   * @param {object} obj - 검색할 객체
   * @param {string} keyword - 찾을 키워드
   * @returns {string|null} 찾은 키 또는 null
   */
  findKeyContaining(obj, keyword) {
    return Object.keys(obj).find(key => key.includes(keyword)) || null;
  },
  
  /**
   * 문자열에서 이메일 추출
   * 
   * @param {string} str - 검색할 문자열
   * @returns {string|null} 이메일 또는 null
   */
  extractEmail(str) {
    if (!str) return null;
    const match = str.toString().match(EMAIL_REGEX);
    return match ? match[0] : null;
  }
};

/**
 * 실행 로그 기록
 * 
 * @param {string} action - 로그 내용
 */
function writeToLog(action = "Action") {
  try {
    const logSheet = SpreadsheetApp
      .openById(CONFIG.SPREADSHEET_ID)
      .getSheetByName(CONFIG.SHEETS.LOG);
    
    if (logSheet) {
      logSheet.appendRow([
        new Date(),
        Session.getActiveUser().getEmail(),
        action
      ]);
    }
  } catch (e) {
    Logger.log(`로그 기록 실패: ${e.message}`);
  }
}

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
    const view = this.templateView(data);

    return template.replace(/\{\{(.*?)\}\}/g, (match, key) => {
      const cleanKey = key.trim().replace(/\s+/g, "");
      const value = view[cleanKey];

      if (value instanceof Date) {
        return Utilities.formatDate(value, CONFIG.TIMEZONE, "yyyy-MM-dd");
      }

      return value !== undefined && value !== null ? value : match;
    });
  },

  /**
   * 휴가 종류 표시용 이름
   * 연차: 종일 → "연차", 반차 → "오전반차" / "오후반차"
   * 그 외: 휴가구분 그대로 (경조휴가, 병가 등)
   */
  leaveLabel(row) {
    const type = String((row && row.휴가구분) || "").trim();
    const sub = String((row && row.연차구분) || "");
    if (type === "연차") {
      if (sub.indexOf("오전") >= 0) return "오전반차";
      if (sub.indexOf("오후") >= 0) return "오후반차";
    }
    return type;
  },

  /**
   * 템플릿 치환용 데이터 (원본 행은 변경하지 않음)
   * - {{휴가종류}} : 연차 / 오전반차 / 오후반차 / 경조휴가 ...
   * - {{휴가구분}} : 반차인 경우 "연차" 대신 "오전반차"/"오후반차" 로 표시
   *   → __Settings 템플릿을 바꾸지 않아도 캘린더 제목·메일에 반차 구분이 나옴
   */
  templateView(row) {
    if (!row) return {};
    const label = this.leaveLabel(row);
    return Object.assign({}, row, { 휴가종류: label, 휴가구분: label || row.휴가구분 });
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
  },

  /**
   * HTML 특수문자 이스케이프 (XSS 방지)
   *
   * @param {string} str - 이스케이프할 문자열
   * @returns {string} 이스케이프된 문자열
   */
  escapeHtml(str) {
    if (!str) return "";
    return str.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
};

/**
 * 실행 로그 기록
 *
 * @param {string} action - 로그 내용
 */
function writeToLog(action = "Action") {
  try {
    const logSheet = getSheet_(CONFIG.SHEETS.LOG);

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

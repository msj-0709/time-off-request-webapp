/**
 * ============================================
 * EmailService.gs - 이메일 발송 관리
 * ============================================
 * 
 * 모든 이메일 발송 로직을 관리합니다.
 */

const EmailService = {
  
  /**
   * 승인 요청 메일 발송 (승인자에게)
   * 
   * @param {object} row - 행 데이터
   */
  sendPendingEmail(row) {
    const approverEmail = this._getApproverEmail(row);
    
    if (!approverEmail) {
      Logger.log("⚠️ 승인자 이메일을 찾을 수 없습니다.");
      return;
    }
    
    const subject = Utils.processTemplate(SETTINGS.PENDING_MANAGER_EMAIL_SUBJECT, row);
    const body = Utils.processTemplate(SETTINGS.PENDING_MANAGER_EMAIL, row);
    
    this._send(approverEmail, subject, body);
    Logger.log(`📧 승인요청 메일 발송: ${approverEmail}`);
  },
  
  /**
   * 승인 완료 메일 발송 (신청자에게)
   * 
   * @param {object} row - 행 데이터
   */
  sendApprovalEmail(row) {
    const targetEmail = this._getRequesterEmail(row);
    
    if (!targetEmail) {
      Logger.log("⚠️ 신청자 이메일을 찾을 수 없습니다.");
      return;
    }
    
    const subject = Utils.processTemplate(SETTINGS.USER_APPROVAL_EMAIL_SUBJECT, row);
    const body = Utils.processTemplate(SETTINGS.USER_APPROVAL_EMAIL, row);
    
    this._send(targetEmail, subject, body);
    Logger.log(`📧 승인완료 메일 발송: ${targetEmail}`);
  },
  
  /**
   * 반려 메일 발송 (신청자에게)
   * 
   * @param {object} row - 행 데이터
   */
  sendDenialEmail(row) {
    const targetEmail = this._getRequesterEmail(row);
    
    if (!targetEmail) {
      Logger.log("⚠️ 신청자 이메일을 찾을 수 없습니다.");
      return;
    }
    
    const subject = Utils.processTemplate(SETTINGS.USER_DENIED_EMAIL_SUBJECT, row);
    const body = Utils.processTemplate(SETTINGS.USER_DENIED_EMAIL, row);
    
    this._send(targetEmail, subject, body);
    Logger.log(`📧 반려 메일 발송: ${targetEmail}`);
  },
  
  /**
   * 취소 메일 발송 (선택적)
   * 
   * @param {object} row - 행 데이터
   */
  sendCancellationEmail(row) {
    const targetEmail = this._getRequesterEmail(row);
    
    if (!targetEmail || !SETTINGS.USER_CANCELLED_EMAIL) {
      return;
    }
    
    const subject = Utils.processTemplate(SETTINGS.USER_CANCELLED_EMAIL_SUBJECT, row);
    const body = Utils.processTemplate(SETTINGS.USER_CANCELLED_EMAIL, row);
    
    this._send(targetEmail, subject, body);
    Logger.log(`📧 취소 메일 발송: ${targetEmail}`);
  },
  
  // ========== Private 메서드 ==========
  
  /**
   * 이메일 발송 (공통)
   */
  _send(to, subject, htmlBody) {
    try {
      MailApp.sendEmail(to, subject, "", { htmlBody });
    } catch (e) {
      Logger.log(`❌ 메일 발송 실패: ${e.message}`);
    }
  },
  
  /**
   * 승인자 이메일 추출
   */
  _getApproverEmail(row) {
    const key = Utils.findKeyContaining(row, "승인자");
    const rawValue = key ? row[key] : "";
    return Utils.extractEmail(rawValue);
  },
  
  /**
   * 신청자 이메일 추출
   */
  _getRequesterEmail(row) {
    return row.이메일주소 || row.emailaddress || row.이메일_주소 || null;
  }
};

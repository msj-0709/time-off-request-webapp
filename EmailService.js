/**
 * ============================================
 * EmailService.gs - 이메일 발송 관리
 * ============================================
 *
 * 모든 이메일 발송 로직을 관리합니다.
 *
 * [__Settings 시트 필요 키]
 * - PENDING_MANAGER_EMAIL_SUBJECT / PENDING_MANAGER_EMAIL
 * - USER_APPROVAL_EMAIL_SUBJECT   / USER_APPROVAL_EMAIL
 * - USER_DENIED_EMAIL_SUBJECT     / USER_DENIED_EMAIL
 * - USER_CANCELLED_EMAIL_SUBJECT  / USER_CANCELLED_EMAIL  (선택)
 * - ANNOUNCEMENT_EMAIL_SUBJECT    / ANNOUNCEMENT_EMAIL    (전사 공지용)
 * - ANNOUNCEMENT_EMAIL_LIST       (AdminDirectory 실패 시 fallback, 쉼표 구분)
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

  /**
   * 전사 공지 메일 발송
   * 승인 완료 시 @j2db.co.kr 전 직원에게 휴가 사실 알림
   *
   * [설정 필요]
   * - ANNOUNCEMENT_EMAIL_SUBJECT : 제목 템플릿
   * - ANNOUNCEMENT_EMAIL         : 본문 템플릿
   * - ANNOUNCEMENT_EMAIL_LIST    : AdminDirectory 실패 시 fallback (쉼표 구분 이메일)
   *
   * @param {object} row - 행 데이터
   */
  sendAnnouncementEmail(row) {
    if (!SETTINGS.ANNOUNCEMENT_EMAIL_SUBJECT || !SETTINGS.ANNOUNCEMENT_EMAIL) {
      Logger.log("⚠️ ANNOUNCEMENT_EMAIL_SUBJECT / ANNOUNCEMENT_EMAIL 설정이 없어 전사 공지를 건너뜁니다.");
      return;
    }

    const emails = this._getAllCompanyEmails();

    if (emails.length === 0) {
      Logger.log("⚠️ 전사 공지 발송 대상이 없습니다.");
      return;
    }

    const subject = Utils.processTemplate(SETTINGS.ANNOUNCEMENT_EMAIL_SUBJECT, row);
    const body = Utils.processTemplate(SETTINGS.ANNOUNCEMENT_EMAIL, row);

    try {
      // BCC로 한 번에 발송 (수신자 목록 비공개)
      const senderEmail = Session.getEffectiveUser().getEmail();
      MailApp.sendEmail({
        to: senderEmail,
        bcc: emails.join(","),
        subject: subject,
        htmlBody: body
      });
      Logger.log(`📧 전사 공지 발송 완료: ${emails.length}명 (BCC)`);
    } catch (e) {
      Logger.log(`❌ 전사 공지 발송 실패: ${e.message}`);
    }
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
   * findKeyContaining으로 동적 탐색 후 기존 고정키 fallback
   */
  _getRequesterEmail(row) {
    // 1단계: '이메일' 키워드를 포함한 컬럼 동적 탐색
    const key = Utils.findKeyContaining(row, "이메일")
      || Utils.findKeyContaining(row, "email")
      || Utils.findKeyContaining(row, "Email");

    if (key && row[key]) {
      const extracted = Utils.extractEmail(row[key]);
      if (extracted) return extracted;
    }

    // 2단계: 기존 고정키 fallback (하위 호환)
    return row.이메일주소 || row.emailaddress || row.이메일_주소 || null;
  },

  /**
   * @j2db.co.kr 전 직원 이메일 목록 조회
   * 1순위: People API (관리자 권한 불필요)
   * 2순위: AdminDirectory API
   * 3순위: SETTINGS.ANNOUNCEMENT_EMAIL_LIST fallback
   *
   * @returns {string[]} 이메일 배열
   */
  _getAllCompanyEmails() {
    const domain = CONFIG.ANNOUNCEMENT_DOMAIN;
    const emails = [];

    // 1순위: People API (관리자 권한 없어도 동작)
    try {
      let pageToken = null;

      do {
        const params = {
          readMask: "emailAddresses",
          sources: ["DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE"],
          pageSize: 1000
        };
        if (pageToken) params.pageToken = pageToken;

        const result = People.People.listDirectoryPeople(params);

        if (result.people) {
          result.people.forEach(person => {
            if (!person.emailAddresses) return;
            person.emailAddresses.forEach(addr => {
              if (addr.value && addr.value.endsWith("@" + domain)) {
                emails.push(addr.value);
              }
            });
          });
        }

        pageToken = result.nextPageToken;
      } while (pageToken);

      Logger.log(`✅ People API: @${domain} 계정 ${emails.length}개 조회`);
      if (emails.length > 0) return emails;
      Logger.log(`⚠️ People API 결과 0건 → AdminDirectory 시도`);

    } catch (e) {
      Logger.log(`⚠️ People API 실패 (${e.message}) → AdminDirectory 시도`);
    }

    // 2순위: AdminDirectory API
    try {
      let pageToken = null;

      do {
        const params = { domain: domain, maxResults: 500, orderBy: "email" };
        if (pageToken) params.pageToken = pageToken;

        const result = AdminDirectory.Users.list(params);

        if (result.users) {
          result.users.forEach(user => {
            if (user.primaryEmail && user.primaryEmail.endsWith("@" + domain)) {
              emails.push(user.primaryEmail);
            }
          });
        }

        pageToken = result.nextPageToken;
      } while (pageToken);

      Logger.log(`✅ AdminDirectory: @${domain} 계정 ${emails.length}개 조회`);
      if (emails.length > 0) return emails;
      Logger.log(`⚠️ AdminDirectory 결과 0건 → SETTINGS fallback 사용`);

    } catch (e) {
      Logger.log(`⚠️ AdminDirectory 실패 (${e.message}) → SETTINGS fallback 사용`);
    }

    // 3순위: SETTINGS 수동 목록
    const fallback = SETTINGS.ANNOUNCEMENT_EMAIL_LIST;
    if (fallback) {
      fallback.split(",").forEach(email => {
        const trimmed = email.trim();
        if (trimmed) emails.push(trimmed);
      });
      Logger.log(`↩️ SETTINGS fallback: ${emails.length}개 이메일 로드`);
    }

    return emails;
  }
};

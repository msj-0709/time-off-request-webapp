/**
 * ============================================
 * Pages.gs - HTML 페이지 생성
 * ============================================
 */

/**
 * 리다이렉트 페이지 생성
 * 
 * @param {string} url - 이동할 URL
 */
function createRedirectPage(url) {
  return HtmlService.createHtmlOutput(`
    <html>
      <head>
        <meta http-equiv="refresh" content="0;url=${url}">
        <script>
          window.top.location.href = "${url}";
        </script>
      </head>
      <body>
        <p>이동 중입니다. 자동으로 이동하지 않으면 <a href="${url}" target="_top">여기</a>를 클릭하세요.</p>
      </body>
    </html>
  `)
  .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
  .setTitle("휴가신청");
}

/**
 * 승인/반려 완료 페이지 생성
 * 
 * @param {string} icon - 아이콘 (✅ 또는 ❌)
 * @param {string} message - 메시지
 * @param {string} color - 색상 코드
 */
function createApprovalPage(icon, message, color) {
  return HtmlService.createHtmlOutput(`
    <html>
    <head>
      <style>
        body {
          font-family: 'Google Sans', Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background: #f8f9fa;
        }
        .alert-box {
          background: white;
          padding: 40px 60px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          text-align: center;
        }
        .icon { font-size: 48px; margin-bottom: 16px; }
        .message { font-size: 20px; color: ${color}; margin-bottom: 8px; }
      </style>
    </head>
    <body>
      <div class="alert-box">
        <div class="icon">${icon}</div>
        <div class="message">${message}</div>
      </div>
      <script>
        setTimeout(() => window.close(), 3000);
      </script>
    </body>
    </html>
  `);
}

/**
 * 에러 페이지 생성
 * 
 * @param {string} errorMessage - 에러 메시지
 */
function createErrorPage(errorMessage) {
  return HtmlService.createHtmlOutput(`
    <html>
    <head>
      <style>
        body {
          font-family: 'Google Sans', Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background: #f8f9fa;
        }
        .error-box {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          border-left: 4px solid #d93025;
        }
        h3 { color: #d93025; margin-top: 0; }
        p { color: #5f6368; margin: 8px 0; }
      </style>
    </head>
    <body>
      <div class="error-box">
        <h3>⚠️ 처리 중 오류가 발생했습니다</h3>
        <p>원인: ${errorMessage}</p>
        <p>시트 이름과 배포 권한을 다시 확인해 주세요.</p>
      </div>
    </body>
    </html>
  `);
}

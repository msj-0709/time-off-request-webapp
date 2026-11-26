 function debugRowKeys() {
    const sheet = SpreadsheetApp
      .openById(CONFIG.SPREADSHEET_ID)
      .getSheetByName(CONFIG.SHEETS.RESPONSES);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const normalized = headers.map(h => Utils.normalizeHeader(h));
    Logger.log(normalized);
  }
  
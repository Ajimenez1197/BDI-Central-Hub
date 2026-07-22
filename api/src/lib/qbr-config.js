/**
 * qbr-config.js — Per-client configuration for the Quarterly Business Report.
 *
 * The QBR "Channel Analysis" section groups gifts into business channels
 * (DM Appeals, Newsletter, Email, Web, …). Those categories are NOT stored in
 * the database — for most clients c_jobs.Channel_ID is just "DM" — so they are
 * derived by classifying each gift's Appeal_ID against a hand-maintained rule
 * set. This file holds that rule set, keyed by client, ported 1:1 from the
 * client's R Markdown QBR.
 *
 * To onboard another client, add an entry to CHANNEL_RULES with its own code
 * lists and (optionally) prefix rules. Clients without an entry simply don't
 * get the Channel Analysis section (the endpoint reports it as unavailable).
 */

/**
 * TWC (Union Gospel Mission Twin Cities) appeal-code lists.
 * Copied verbatim from "TWC QBR Template Q3.Rmd" — Channel Analysis chunk.
 */
const TWC_MAJOR_GIFT_IDS = ["2020GeneralMatch", "Fiscal Year 2019-2020", "Personal Solicit"];

const TWC_RECEIPT_IDS = ["R110-2010", "R919-2009", "Receipt"];

const TWC_MONTHLY_IDS = ["N727-2017", "NC27-2017"];

const TWC_WHITE_MAIL_IDS = [
  "APTA-0008", "NonUGMFundraiser", "Stock Gift",
  "TA10-0000", "TEST", "Walk IN", "Walk-In",
  "Walked-in", "White",
];

const TWC_EMAIL_IDS = [
  "0123AP", "0123AP2", "0123EA2", "0123EP",
  "0223AP", "0223EA", "0223MGAP", "0223MGEA", "0223NAP", "0223NEA",
  "0223PAP", "0223PEA",
  "0323AP", "0323AP2", "0323EA", "0323EA2", "0323EB", "0323TEA",
  "0323WAP", "0323WEA",
  "0423AP", "0423EA", "0423FEA", "0423MDAP", "0423MDEA",
  "1022AP", "1022AP2", "1022EA", "1022EA2",
  "1122AP", "1122EA", "1122GTAP", "1122GTBFEA", "1122GTEA",
  "1122GTFUEA", "1122GTTYEA",
  "1222AP", "1222AP2", "1222EA", "1222EA2", "1222EAT", "1222LCEA",
  "1222YEAP", "1222YEEA",
  "31daysofhope", "AMP1-2018", "BWAS7-2020", "COVID19", "DNCEmail",
  "EN032023", "EN062023", "EN092023", "EN112022",
  "F10-2020", "F110-2020", "F111-2021", "F119-2019", "F120-2020",
  "F121-2021", "F121-2022", "F126-2016", "F128-2018", "F166-2016",
  "F210-2020", "F211-2021", "F218-2018", "F219-2019", "F220-2020",
  "F221-2021", "F221-2022", "F222-2022", "F310-2020", "F311-2021",
  "F316-2016", "F317-2017", "F318-2018", "F319-2019", "F320-2020",
  "F321-2021", "F321-2022", "F322-2022", "F327-2017", "F328-2018",
  "F330-2020", "F331-2021", "F337-2017", "F338-2018", "F341-2021",
  "F347-2017", "F351-2021", "F361-2021", "F371-2021", "F385-2015",
  "F410-2020", "F418-2018", "F419-2019", "F420-2020", "F421-2022",
  "F422-2022", "F423-2022", "F427-2017", "F429-2019", "F430-2020",
  "F439-2019", "F440-2020", "F510-2020", "F511-2021", "F516-2016",
  "F517-2017", "F518-2018", "F519-2019", "F521-2022", "F610-2020",
  "F611-2021", "F617-2017", "F618-2018", "F619-2019", "F620-2020",
  "F621-2021", "F621-2022", "F622-2022", "F626-2016", "F629-2019",
  "F630-2020", "F631-2021", "F638-2018", "F639-2019", "F710-2020",
  "F711-2021", "F717-2017", "F719-2019", "F721-2022", "F729-2019",
  "F810-2020", "F811-2021", "F817-2017", "F818-2018", "F820-2020",
  "F821-2021", "F821-2022", "F837-2017", "F910-2020", "F911-2021",
  "F912-2022", "F916-2016", "F918-2018", "F919-2019", "F920-2020",
  "F921-2021", "F921-2022", "F922-2022", "F929-2019", "F930-2020",
  "FA10-2020", "FA18-2018", "FA19-2019", "FA29-2019", "FB10-2020",
  "FB12-2020", "FB13-2013", "FB13-2020", "FB14-2020", "FB15-2020",
  "FB16-2020", "FB17-2017", "FB17-2020", "FB18-2018", "FB19-2019",
  "FB21-2022", "FB22-2022", "FB23-2022", "FB24-2022", "FB26-2016",
  "FB27-2017", "FB28-2018", "FB29-2019", "FB37-2017", "FB38-2018",
  "FB39-2019", "FB48-2018", "FB49-2019", "FB58-2018", "FB59-2019",
  "FB68-2018", "FB69-2019", "FB78-2018", "FB79-2019", "FB88-2018",
  "FBCOV-2020", "FC09-2019", "FC10-2020", "FC11-2020", "FC12-2020",
  "FC122-2022", "FC13-2020", "FC14-2020", "FC15-2020", "FC16-2020",
  "FC17-2017", "FC17-2020", "FC18-2018", "FC18-2020", "FC19-2019",
  "FC19-2020", "FC21-2022", "FC22-2022", "FC23-2022", "FC24-2022",
  "FC25-2015", "FC25-2022", "FC26-2022", "FC27-2017", "FC27-2022",
  "FC28-2018", "FC28-2022", "FC29-2019", "FC37-2017", "FC38-2018",
  "FC39-2019", "FC47-2017", "FC48-2018", "FC49-2019", "FC58-2018",
  "FC59-2019", "FC67-2017", "FC68-2018", "FC69-2019", "FC77-2017",
  "FC78-2018", "FC79-2019", "FC89-2019", "FC99-2019", "FF16-2016",
  "FF17-2017", "FF28-2018", "FF36-2016", "FF76-2016", "FF86-2016",
  "FG28-2018", "FG38-2018", "FHW6-2021", "FK11-2018", "FKMS-2018",
  "FR70-2020", "FR71-2021", "FV18-2018", "FW17-2017",
  "GM10-2020", "GM11-2020", "GM12-2020", "GM21-2022",
  "GT10-2020", "GT11-2020", "GT12-2020", "GT13-2020", "GT19-2019",
  "GT21-2022", "GT22-2022", "GT23-2022", "GT29-2019", "GT39-2019",
  "GT49-2019", "GT59-2019", "GT69-2020",
  "GVMN22", "H4H-2020", "MGE2022",
  "Welcome", "WELCOME", "WelcomeMG", "COVID19",
];

const TWC_WEB_IDS = [
  "0123FB", "0123LB", "0223CFB", "0223WFB", "0323FB", "0323LCFB",
  "0323LCLB", "0323NDA", "0323PDA", "0323PLB", "0323SDA", "0323TFB",
  "0323VDA", "0323WFB",
  "0922THXDA", "0922THXDA2", "0922THXMGDA", "0922THXNDA",
  "1022FB", "1022LB",
  "1122FB", "1122GTEAT", "1122GTFB", "1122GTLB", "1122LB", "1122VFB",
  "1122YT",
  "1222DA", "1222HFB", "1222LB", "1222MFB", "1222NDA", "1222VDA",
  "1222YEDA", "1222YEFB", "1222YELB", "1222YENDA", "1222YETLB",
  "1222YEVFB", "1222YT",
  "2017Hope", "2017SMHope",
  "2018iHeartAAds", "2018iHeartDAds", "2018iHeartVAds",
  "2018iHMilAAds", "2018iHMilDAds", "2018iHMilVAds",
  "2019OverTheTop", "2019TruView",
  "22SEARCH", "31DaysofSummer", "BA",
  "CFB1-2019", "CFB2-2019", "CFB3-2019", "CFB4-2019",
  "FB01-2019", "FB01-2022", "FB02-2019", "FB02-2022",
  "FB03-2019", "FB03-2022", "FB04-2019", "FB04-2022",
  "FB09-2022", "FB11-2021", "FB12-2021", "FB13-2021", "FB13-2022",
  "FB14-2021", "FB14-2022", "FB15-2021", "FB15-2022",
  "FB16-2021", "FB16-2022", "FB17-2022", "FB18-2022", "FB19-2022",
  "FB25-2022", "FB26-2022", "FB27-2022", "FB28-2022", "FB29-2022",
  "FB30-2022", "FB31-2022", "FB32-2022", "FB33-2022", "FB34-2022",
  "FB35-2022", "FB36-2022", "FB37-2022", "FB38-2022", "FB39-2022",
  "FB40-2022", "FB41-2022", "FB42-2022", "FB43-2022", "FB44-2022",
  "FB45-2022", "FB46-2022", "FB47-2022", "FB48-2022", "FB49-2022",
  "FB50-2022", "FB51-2022",
  "FBA1-2017", "FBA2-2017", "FBA5-2018", "FBA6-2018", "FBA7-2018",
  "FBK01-2020", "FBK02-2020", "FBK1-2017", "FBK1-2018", "FBK1-2019",
  "FBK1-2020", "FBK1-2021", "FBK1-2022", "FBK10-2018", "FBK10-2019",
  "FBK10-2022", "FBK11-2018", "FBK11-2019", "FBK11-2022",
  "FBK12-2018", "FBK12-2022", "FBK13-2022",
  "FBK2-2017", "FBK2-2018", "FBK2-2019", "FBK2-2020", "FBK2-2021", "FBK2-2022",
  "FBK3-2017", "FBK3-2018", "FBK3-2019", "FBK3-2020", "FBK3-2021", "FBK3-2022",
  "FBK4-2018", "FBK4-2019", "FBK4-2020", "FBK4-2021", "FBK4-2022",
  "FBK5-2018", "FBK5-2019", "FBK5-2020", "FBK5-2021", "FBK5-2022",
  "FBK6-2018", "FBK6-2019", "FBK6-2021", "FBK6-2022",
  "FBK7-2018", "FBK7-2019", "FBK7-2022",
  "FBK8-2018", "FBK8-2019", "FBK8-2022",
  "FBK9-2018", "FBK9-2019", "FBK9-2022",
  "FBTest-2019", "FG18-2018", "FR72-2021", "FR811-2021", "FW18-2018",
  "GivingTuesdayGeneral", "Google Ads", "LFB1-2019", "LFB2-2019",
  "LFB3-2019", "LFB4-2019", "LFB5-2019", "LFB6-2019", "LFB7-2019",
  "MFB1-2019", "MFB2-2019", "MFB3-2019", "MFB4-2019", "MFB5-2019",
  "MFB6-2019", "MFB7-2019", "MFB8-2019", "MFBL1-2019", "MFBL2-2019",
  "PFB1-2019", "PFB2-2019", "PFB3-2019", "PFB4-2019", "PFB5-2019",
  "RFB1-2019", "RFB2-2019", "RFB3-2019", "SFB1-2019", "SFB2-2019",
  "SFB3-2019", "SFB4-2019", "SFB5-2019", "SM2022", "TFB1-2019",
  "Web", "EFT", "Conduit Matching",
];

/**
 * CHANNEL_RULES — per-client channel classification.
 *
 * Each entry carries the code lists plus the display order used by the charts
 * and tables. The classification logic (order of precedence, prefix rules) is
 * implemented in buildChannelCaseSql below and matches the client's R report.
 */
const CHANNEL_RULES = {
  TWC: {
    majorGiftIds: TWC_MAJOR_GIFT_IDS,
    receiptIds: TWC_RECEIPT_IDS,
    monthlyIds: TWC_MONTHLY_IDS,
    whiteMailIds: TWC_WHITE_MAIL_IDS,
    emailIds: TWC_EMAIL_IDS,
    webIds: TWC_WEB_IDS,
    // Order the categories appear in charts/tables (matches the R chart).
    order: [
      "DM Appeals", "Newsletter", "White Mail", "Web",
      "Major Gifts", "Receipt Returns", "UGM Monthly",
      "Email", "Acquisition",
    ],
  },
};

/** True when a client has a Channel Analysis rule set. */
export function hasChannelConfig(clientId) {
  return Boolean(CHANNEL_RULES[clientId?.toUpperCase()]);
}

/** Category display order for a client's Channel Analysis (or []). */
export function getChannelOrder(clientId) {
  const cfg = CHANNEL_RULES[clientId?.toUpperCase()];
  return cfg ? cfg.order.slice() : [];
}

/** Escape a string literal for inline SQL (double single-quotes). */
function q(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/** Render a JS array as a SQL `(...)` IN-list of quoted literals. */
function inList(arr) {
  return `(${arr.map(q).join(", ")})`;
}

/**
 * Build the SQL CASE expression that classifies a gift's Appeal_ID column into
 * a channel category, replicating the R case_when (same order of precedence).
 *
 * The lists are static, server-side constants (never user input), so inlining
 * them as quoted literals is safe. Returns null if the client has no config.
 *
 * @param {string} clientId
 * @param {string} col - the SQL column expression for Appeal_ID (e.g. "G.APPEAL_ID")
 * @returns {string|null} a SQL expression evaluating to the category name
 */
export function buildChannelCaseSql(clientId, col = "APPEAL_ID") {
  const cfg = CHANNEL_RULES[clientId?.toUpperCase()];
  if (!cfg) return null;

  const excluded = `${col} NOT IN ${inList([
    ...cfg.webIds, ...cfg.emailIds, ...cfg.whiteMailIds, ...cfg.monthlyIds,
  ])}`;

  // Order matters — first matching branch wins, exactly like R case_when.
  return `CASE
    WHEN ${col} IN ${inList(cfg.majorGiftIds)} THEN 'Major Gifts'
    WHEN ${col} IN ${inList(cfg.receiptIds)} THEN 'Receipt Returns'
    WHEN ${col} IN ${inList(cfg.monthlyIds)} OR ${col} LIKE '%Recurring%' THEN 'UGM Monthly'
    WHEN ${col} LIKE 'C%' AND ${excluded} THEN 'DM Appeals'
    WHEN ${col} LIKE 'N%' AND ${excluded} THEN 'Newsletter'
    WHEN (${col} LIKE 'A%' AND ${excluded}) OR ${col} = 'Bank Check' THEN 'Acquisition'
    WHEN ${col} IN ${inList(cfg.emailIds)} OR (${col} LIKE 'W2%' AND ${col} LIKE '%EA%') THEN 'Email'
    WHEN ${col} IN ${inList(cfg.webIds)} OR (${col} LIKE 'W2%' AND ${col} LIKE '%LB%') THEN 'Web'
    WHEN ${col} IS NULL OR ${col} IN ${inList(cfg.whiteMailIds)} THEN 'White Mail'
    ELSE 'Other'
  END`;
}

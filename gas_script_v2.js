// ==========================================
// 設定エリア
// ==========================================
// ★あなたのメールアドレス (通知や検索に使用)
const MY_EMAIL = "narutakuyb+video@gmail.com";

// ★Google Driveの保存先フォルダID
const FOLDER_ID = "13fNsuwfvL3TKTawp8XlXM_fuPu63F1-d";

// ★StreamlitアプリのURL (Keep-Alive用)
// ※正しいURLを設定してください
const APP_URL = "https://share.streamlit.io/kenono-dancer/video-app/main/app.py";
// または "https://video-app-zwyxhpvhfxxpvhbnn4ukij.streamlit.app" など

// ==========================================
// トリガー設定の手順 (重要！)
// ==========================================
// エラー "RESOURCE_EXHAUSTED" を防ぐため、以下の2つのトリガーを個別に設定してください。
//
// 1. 関数: keepAlive
//    - イベントのソース: 時間主導型 (Time-driven)
//    - タイプ: 分ベースのタイマー (Minutes timer)
//    - 間隔: 10分おき (Every 10 minutes)
//    → 目的: アプリがスリープしないように叩くだけ (軽量)
//
// 2. 関数: mainManager
//    - イベントのソース: 時間主導型 (Time-driven)
//    - タイプ: 分ベースのタイマー (Minutes timer)
//    - 間隔: 15分おき (Every 15 minutes)
//    → 目的: メールの確認とデータ更新
//    ※もしエラー頻発するようなら、30分〜1時間に延ばしてください。
//
// ※以前のトリガー設定は削除してから、上記通りに再設定してください。
// ==========================================

// ★メール処理＆データ更新のメイン関数 (重い処理)
function mainManager() {
    console.log("--- 自動化処理を開始 ---");
    try {
        processEmails();       // 1. メールからの登録
        processManualRows();   // 2. 手入力分のデータ補完
    } catch (e) {
        console.error("mainManager Error: " + e.message);
    }
    console.log("--- 処理終了 ---");
}

// ★スリープ防止専用関数 (軽い処理)
function keepAlive() {
    try {
        const response = UrlFetchApp.fetch(APP_URL, { muteHttpExceptions: true });
        console.log(`Keep-Alive access status: ${response.getResponseCode()}`);
    } catch (e) {
        console.log(`Keep-Alive error: ${e.message}`);
    }
}

// ------------------------------------------
// 1. メール処理機能
// ------------------------------------------
function processEmails() {
    const query = `to:${MY_EMAIL} is:unread`;
    const threads = GmailApp.search(query);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("シート1");

    if (threads.length === 0) return;

    threads.forEach(thread => {
        const messages = thread.getMessages();
        messages.forEach(message => {
            if (message.isUnread()) {
                const body = message.getPlainBody();
                const subject = message.getSubject();
                const date = message.getDate();

                const urlMatch = body.match(/https?:\/\/[\w!?/+\-_~=;.,*&@#$()'[\]]+/);
                const url = urlMatch ? urlMatch[0] : "";

                if (url) {
                    // 本文解析
                    const lines = body.split(/\r\n|\r|\n/).filter(line => line.trim() !== "");
                    const genre = lines.length > 0 ? lines[0].trim() : "未分類";
                    const userMemo = lines.length > 1 ? lines[1].trim() : "";

                    // メール件名をダンサー名として扱う
                    const dancerName = subject || "";

                    // データを揃えて保存（画像取得などは共通関数におまかせ）
                    saveRowToSheet(sheet, date, url, dancerName, genre, userMemo);
                }
                message.markRead();
            }
        });
    });
}

// ------------------------------------------
// 2. 手入力分のパトロール機能
// ------------------------------------------
function processManualRows() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("シート1");
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return; // データがない場合

    // データ範囲を一括取得 (2行目〜最終行, A列〜H列)
    const range = sheet.getRange(2, 1, lastRow - 1, 8);
    const data = range.getValues();
    let isUpdated = false;

    for (let i = 0; i < data.length; i++) {
        let row = data[i];
        // A:日付, B:サムネ, C:サイト, D:ダンサー, E:種目, F:メモ, G:動画URL, H:画像URL

        const videoUrl = row[6]; // G列
        const imageUrl = row[7]; // H列

        // 「動画URLはある」のに「画像URLが空っぽ」の行を見つけたら処理する
        if (videoUrl && videoUrl.startsWith("http") && !imageUrl) {
            console.log(`手入力データを検出: ${videoUrl}`);

            const metaInfo = fetchWebInfo(videoUrl);

            // 画像保存
            let newImageUrl = "";
            let displayThumb = "";
            if (metaInfo.imageUrl && FOLDER_ID) {
                newImageUrl = saveImageToDrive(metaInfo.imageUrl, metaInfo.title);
            }

            // サムネ表示用数式
            if (newImageUrl) {
                displayThumb = `=HYPERLINK("${videoUrl}", IMAGE("${newImageUrl}", 1))`;
            } else {
                displayThumb = `=HYPERLINK("${videoUrl}", "No Image")`;
            }

            // サイト名が空なら埋める
            if (!row[2]) row[2] = metaInfo.site;

            // メモにタイトルを追記（すでに書いてあるメモは消さない）
            if (metaInfo.title && metaInfo.title !== "タイトル取得不可" && metaInfo.title !== "Instagram") {
                if (row[5]) row[5] += `\n[${metaInfo.title}]`;
                else row[5] = `[${metaInfo.title}]`;
            }

            // 日付が空なら今日の日付を入れる
            if (!row[0]) row[0] = new Date();

            // 配列を更新
            row[1] = displayThumb; // B列
            row[7] = newImageUrl;  // H列

            // シートに書き戻す (1行ずつ更新)
            sheet.getRange(i + 2, 1, 1, 8).setValues([row]);
            isUpdated = true;

            // API制限回避のため、少し待機 (1秒)
            Utilities.sleep(1000);
        }
    }
}

// 共通：行を追加・更新するヘルパー関数
function saveRowToSheet(sheet, date, url, dancer, genre, memo) {
    // Web情報取得
    const metaInfo = fetchWebInfo(url);

    // 画像処理
    let rawImageLink = "";
    let displayThumb = "";
    if (metaInfo.imageUrl && FOLDER_ID) {
        rawImageLink = saveImageToDrive(metaInfo.imageUrl, metaInfo.title);
    }

    if (rawImageLink) {
        displayThumb = `=HYPERLINK("${url}", IMAGE("${rawImageLink}", 1))`;
    } else {
        displayThumb = `=HYPERLINK("${url}", "No Image")`;
    }

    // メモ結合
    let finalMemo = memo;
    if (metaInfo.title && metaInfo.title !== "タイトル取得不可" && metaInfo.title !== "Instagram") {
        if (finalMemo) finalMemo += "\n";
        finalMemo += `[${metaInfo.title}]`;
    }

    // A:日時, B:サムネ, C:サイト, D:ダンサー, E:種目, F:メモ, G:動画URL, H:画像URL
    sheet.appendRow([date, displayThumb, metaInfo.site, dancer, genre, finalMemo, url, rawImageLink]);
}

// ------------------------------------------
// ツール関数群 (前回と同じ最強版)
// ------------------------------------------
function saveImageToDrive(imageUrl, title) {
    try {
        const response = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
        if (response.getResponseCode() === 200) {
            const blob = response.getBlob();
            let safeTitle = "thumb";
            if (title) safeTitle = title.substring(0, 15).replace(/[\\/:*?"<>|]/g, "_");
            blob.setName(`${safeTitle}_${new Date().getTime()}.jpg`);
            const folder = DriveApp.getFolderById(FOLDER_ID);
            const file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            return "https://lh3.googleusercontent.com/d/" + file.getId();
        }
    } catch (e) { console.log("画像エラー:" + e.message); return ""; }
    return "";
}

function fetchWebInfo(url) {
    let title = "タイトル取得不可";
    let siteName = "その他";
    let imageUrl = "";

    if (url.includes("youtu")) siteName = "YouTube";
    else if (url.includes("instagram")) siteName = "Instagram";
    else if (url.includes("twitter") || url.includes("x.com")) siteName = "X (Twitter)";
    else if (url.includes("tiktok")) siteName = "TikTok";

    if (siteName === "YouTube") {
        try {
            let videoId = "";
            const match1 = url.match(/v=([^&]+)/);
            const match2 = url.match(/youtu\.be\/([^?]+)/);
            const match3 = url.match(/shorts\/([^?]+)/);
            if (match1) videoId = match1[1];
            else if (match2) videoId = match2[1];
            else if (match3) videoId = match3[1];
            if (videoId) {
                imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                title = "YouTube動画";
            }
        } catch (e) { }
    } else if (siteName === "X (Twitter)") {
        // ★ここを変更: X (Twitter) の場合は fxtwitter.com 経由でメタデータを取る
        try {
            // url内の x.com, twitter.com を fxtwitter.com に置換
            const fxUrl = url.replace("x.com", "fxtwitter.com").replace("twitter.com", "fxtwitter.com");

            // BotとしてアクセスすることでOGPを取得しやすくする
            const options = {
                muteHttpExceptions: true,
                headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }
            };

            const response = UrlFetchApp.fetch(fxUrl, options);
            if (response.getResponseCode() === 200) {
                const html = response.getContentText("UTF-8");

                // OGPタグから情報を抜く
                const ogTitle = html.match(/property="og:title" content="([^"]+)"/i);
                const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);

                if (ogTitle && ogTitle[1]) title = ogTitle[1].trim();
                else if (titleTag && titleTag[1]) title = titleTag[1].trim();

                const ogImage = html.match(/property="og:image" content="([^"]+)"/i);
                if (ogImage && ogImage[1]) {
                    imageUrl = ogImage[1].replace(/&amp;/g, "&");
                }
            }
        } catch (e) {
            console.log("X(Twitter) fetch error:" + e.message);
        }

    } else {
        // その他のサイト
        try {
            const options = { muteHttpExceptions: true, headers: { "User-Agent": "Mozilla/5.0" } };
            const response = UrlFetchApp.fetch(url, options);
            if (response.getResponseCode() === 200) {
                const html = response.getContentText("UTF-8");
                const ogTitle = html.match(/property="og:title" content="([^"]+)"/i);
                const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (ogTitle && ogTitle[1]) title = ogTitle[1].trim();
                else if (titleTag && titleTag[1]) title = titleTag[1].trim();
                const ogImage = html.match(/property="og:image" content="([^"]+)"/i);
                if (ogImage && ogImage[1]) imageUrl = ogImage[1].replace(/&amp;/g, "&");
            }
        } catch (e) { }
    }
    return { title: title, site: siteName, imageUrl: imageUrl };
}

/**
 * GET API: Returns the spreadsheet data as JSON.
 * Includes phonetic reading (yomi) for Japanese sorting.
 */
function doGet(e) {
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("シート1");
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const rows = data.slice(1);

        // Header mapping: A:日時, B:サムネ, C:サイト, D:ダンサー, E:種目, F:メモ, G:動画URL, H:画像URL
        const jsonData = rows.map((row, index) => {
            const dancer = row[3];
            return {
                id: index + 2, // Row number in sheet
                date: row[0],
                thumbnail: row[1],
                platform: row[2],
                dancer: dancer,
                discipline: row[4],
                memo: row[5],
                videoUrl: row[6],
                imageUrl: row[7],
                yomi: getYomi(dancer) // Add phonetic reading for frontend sorting
            };
        }).filter(row => row.videoUrl); // Only return rows with video URLs

        return ContentService.createTextOutput(JSON.stringify(jsonData))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

/**
 * POST API: Handles registration, editing, and deletion.
 */
function doPost(e) {
    try {
        const params = e.parameter;
        const action = params.action;
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("シート1");

        if (action === "register") {
            const date = new Date();
            const url = params.videoUrl;
            const dancer = params.dancer;
            const genre = params.discipline;
            const memo = params.memo;
            saveRowToSheet(sheet, date, url, dancer, genre, memo);
            return ContentService.createTextOutput(JSON.stringify({ success: true }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        if (action === "edit") {
            const rowId = parseInt(params.id);
            const rowData = [
                params.date,
                params.thumbnail,
                params.platform,
                params.dancer,
                params.discipline,
                params.memo,
                params.videoUrl,
                params.imageUrl
            ];
            sheet.getRange(rowId, 1, 1, 8).setValues([rowData]);
            return ContentService.createTextOutput(JSON.stringify({ success: true }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        if (action === "delete") {
            const rowId = parseInt(params.id);
            sheet.deleteRow(rowId);
            return ContentService.createTextOutput(JSON.stringify({ success: true }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // Image Upload Proxy
        if (params.file_content) {
            const folder = DriveApp.getFolderById(params.folder_id || FOLDER_ID);
            const decoded = Utilities.base64Decode(params.file_content);
            const blob = Utilities.newBlob(decoded, params.mimeType, params.filename);
            const file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            return ContentService.createTextOutput(JSON.stringify({
                success: true,
                url: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1000"
            })).setMimeType(ContentService.MimeType.JSON);
        }

        return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Invalid Action" }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

/**
 * Returns phonetic reading (Katakana) for Japanese text.
 * Note: GAS environment has limited built-in support, 
 * this is a simplified version or can use an external API.
 */
function getYomi(text) {
    if (!text) return "";
    // Simplified: In a real GAS app, we might use LanguageApp or just return the text
    // for frontend to handle if complex. Here we return as-is for now.
    return text;
}
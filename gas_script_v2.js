// ==========================================
// 設定エリア
// ==========================================
const MY_EMAIL = "narutakuyb+video@gmail.com";
const FOLDER_ID = "13fNsuwfvL3TKTawp8XlXM_fuPu63F1-d";
const SHEET_NAME = "シート1"; // シート名が変わった場合はここを修正

// 管理画面のパスワード設定（GAS単体ページ用）
const ADMIN_PASSWORD = "password123"; 

// ==========================================
// メイン実行関数
// ==========================================
function mainManager() {
    console.log("--- 自動化処理を開始 ---");
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
        if (!sheet) throw new Error("シートが見つかりません: " + SHEET_NAME);
        
        processEmails(sheet);       
        processManualRows(sheet);   
    } catch (e) {
        console.error("mainManager Error: " + e.message);
    }
    console.log("--- 処理終了 ---");
}

// ------------------------------------------
// Webアプリ（API機能 ＆ 外部・内部からの同期処理受付）
// ------------------------------------------
function doGet(e) {
    const action = e.parameter.action;
    const pass = e.parameter.p;

    // 1. 外部アプリ（Next.js等）からの同期・更新リクエストの処理
    if (action === "sync") {
        try {
            mainManager(); // メール確認、手入力補完、サムネイル取得を一括実行
            const result = { success: true, message: "Sync completed successfully" };
            return ContentService.createTextOutput(JSON.stringify(result))
                                 .setMimeType(ContentService.MimeType.JSON);
        } catch (err) {
            const errorResult = { success: false, error: err.toString() };
            return ContentService.createTextOutput(JSON.stringify(errorResult))
                                 .setMimeType(ContentService.MimeType.JSON);
        }
    }

    // 2. 管理画面の表示（アクションが "admin" またはパスワードパラメータがある場合のみ）
    if (action === "admin" || pass !== undefined) {
        if (pass !== ADMIN_PASSWORD) {
            return HtmlService.createHtmlOutput(`
                <html>
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body { font-family: sans-serif; background-color: #f4f6f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                            .login-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; width: 300px; }
                            input[type="password"] { width: 100%; padding: 10px; margin: 15px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 16px; }
                            button { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; }
                            button:hover { background: #0056b3; }
                            .error { color: red; font-size: 14px; margin-top: 10px; }
                        </style>
                    </head>
                    <body>
                        <div class="login-container">
                            <h2>管理画面 ログイン</h2>
                            <form method="GET" action="${ScriptApp.getService().getUrl()}">
                                <input type="hidden" name="action" value="admin">
                                <input type="password" name="p" placeholder="パスワードを入力" required>
                                <button type="submit">ログイン</button>
                            </form>
                            ${pass ? '<p class="error">パスワードが違います</p>' : ''}
                        </div>
                    </body>
                </html>
            `);
        }

        // パスワードが一致した場合のスタンドアロン用操作パネル
        return HtmlService.createHtmlOutput(`
            <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: sans-serif; padding: 30px; background-color: #f4f6f9; color: #333; }
                        .card { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; text-align: center; }
                        button { background: #28a745; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold; width: 100%; transition: background 0.2s; }
                        button:hover { background: #218838; }
                        button:disabled { background: #6c757d; cursor: not-allowed; }
                        #status { margin-top: 20px; font-weight: bold; font-size: 15px; min-height: 24px; }
                        .logout { display: inline-block; margin-top: 30px; color: #007bff; text-decoration: none; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h2>動画データ管理パネル</h2>
                        <p style="color: #666; margin-bottom: 25px;">手動でメールの読み込み、およびスプレッドシートのメタデータ・サムネイル補完を実行します。</p>
                        <button id="runBtn" onclick="runUpdate()">更新処理を開始</button>
                        <p id="status"></p>
                        <a href="${ScriptApp.getService().getUrl()}?action=admin" class="logout">ログアウト</a>
                    </div>
                    <script>
                        function runUpdate() {
                            const btn = document.getElementById('runBtn');
                            const status = document.getElementById('status');
                            btn.disabled = true;
                            status.style.color = '#333';
                            status.innerText = '処理中...（数分かかる場合があります）';
                            
                            google.script.run
                                .withSuccessHandler(() => { 
                                    status.style.color = '#28a745';
                                    status.innerText = '完了しました！データの更新を確認してください。'; 
                                    btn.disabled = false; 
                                })
                                .withFailureHandler((err) => { 
                                    status.style.color = '#dc3545';
                                    status.innerText = 'エラーが発生しました: ' + err; 
                                    btn.disabled = false; 
                                })
                                .mainManager();
                        }
                    </script>
                </body>
            </html>
        `);
    }

    // 3. デフォルト動作：APIとしての動画一覧JSONデータ返却（Next.js用）
    return getSpreadsheetDataJson();
}

// データ一覧取得の共通化
function getSpreadsheetDataJson() {
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
        const data = sheet.getDataRange().getValues();
        const rows = data.slice(1);
        const jsonData = rows.map((row, index) => {
            return {
                id: index + 2,
                date: row[0],
                thumbnail: row[1],
                platform: row[2],
                dancer: row[3],
                discipline: row[4],
                memo: row[5],
                videoUrl: row[6],
                imageUrl: row[7],
                yomi: row[3]
            };
        }).filter(row => row.videoUrl);
        return ContentService.createTextOutput(JSON.stringify(jsonData)).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
}

function doPost(e) {
    try {
        const params = e.parameter;
        const action = params.action;
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

        // ★追加：画像アップロード（Next.js等の画像アップロード機能との連携用）
        if (params.file_content) {
            const folder = DriveApp.getFolderById(params.folder_id || FOLDER_ID);
            const decoded = Utilities.base64Decode(params.file_content);
            const blob = Utilities.newBlob(decoded, params.mimeType, params.filename);
            const file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            return ContentService.createTextOutput(JSON.stringify({
                success: true,
                url: "https://drive.google.com/uc?export=view&id=" + file.getId()
            })).setMimeType(ContentService.MimeType.JSON);
        }

        if (action === "register") {
            if (isDuplicateUrl(sheet, params.videoUrl)) {
                return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Already registered" })).setMimeType(ContentService.MimeType.JSON);
            }
            saveRowToSheet(sheet, new Date(), params.videoUrl, params.dancer, params.discipline, params.memo);
            return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
        }
        if (action === "edit") {
            const rowId = parseInt(params.id);
            const rowData = [params.date, params.thumbnail, params.platform, params.dancer, params.discipline, params.memo, params.videoUrl, params.imageUrl];
            sheet.getRange(rowId, 1, 1, 8).setValues([rowData]);
            return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
        }
        if (action === "delete") {
            sheet.deleteRow(parseInt(params.id));
            return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
        }
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Invalid Action" })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
}

// ------------------------------------------
// 重複チェック関数
// ------------------------------------------
function isDuplicateUrl(sheet, url) {
    if (!url) return false;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;

    const urls = sheet.getRange(2, 7, lastRow - 1, 1).getValues().flat();
    const normalizedTarget = url.split('?')[0].replace(/\/$/, "");
    
    return urls.some(existingUrl => {
        if (!existingUrl) return false;
        const normalizedExisting = existingUrl.toString().split('?')[0].replace(/\/$/, "");
        return normalizedExisting === normalizedTarget;
    });
}

// ------------------------------------------
// 1. メール処理機能
// ------------------------------------------
function processEmails(sheet) {
    const query = `to:${MY_EMAIL} is:unread`; 
    const threads = GmailApp.search(query);
    if (threads.length === 0) return;

    threads.forEach(thread => {
        const messages = thread.getMessages();
        messages.forEach(message => {
            if (message.isUnread() && message.getTo().includes(MY_EMAIL)) {
                const body = message.getPlainBody();
                const subject = message.getSubject();
                const date = message.getDate();

                const urlMatch = body.match(/https?:\/\/[\w!?/+\-_~=;.,*&@#$()'[\]]+/);
                const url = urlMatch ? urlMatch[0] : "";

                if (url) {
                    if (isDuplicateUrl(sheet, url)) {
                        console.log(`重複を検知したためスキップ: ${url}`);
                    } else {
                        const lines = body.split(/\r\n|\r|\n/).filter(line => line.trim() !== "");
                        const genre = lines.length > 0 ? lines[0].trim() : "未分類";
                        const userMemo = lines.length > 1 ? lines[1].trim() : "";
                        const dancerName = subject || "";

                        saveRowToSheet(sheet, date, url, dancerName, genre, userMemo);
                    }
                }
                message.markRead(); 
            }
        });
    });
}

// ------------------------------------------
// 2. 手入力・未完了データの補完機能（★Instagram再取得対応）
// ------------------------------------------
function processManualRows(sheet) {
    const range = sheet.getDataRange();
    const data = range.getValues();

    for (let i = 1; i < data.length; i++) {
        let row = data[i];
        const videoUrl = row[6]; 
        const imageUrl = row[7]; 

        const isBrokenInstagram = videoUrl && videoUrl.toString().includes("instagram.com") && imageUrl && imageUrl.toString().includes("media/?size=l");
        const isMissing = !imageUrl || imageUrl === "取得制限あり";

        if (videoUrl && videoUrl.toString().startsWith("http") && (isMissing || isBrokenInstagram)) {
            console.log(`${i + 1}行目を処理中（再取得試行）: ${videoUrl}`);

            const metaInfo = fetchWebInfo(videoUrl);
            let finalImageUrl = metaInfo.imageUrl;
            let driveImageUrl = "";
            
            if (finalImageUrl && FOLDER_ID && finalImageUrl.startsWith("http")) {
                driveImageUrl = saveImageToDrive(finalImageUrl, metaInfo.title);
            }

            let displayThumb = "";
            if (driveImageUrl) {
                displayThumb = `=HYPERLINK("${videoUrl}", IMAGE("${driveImageUrl}", 1))`;
            } else if (finalImageUrl && finalImageUrl.startsWith("http")) {
                displayThumb = `=HYPERLINK("${videoUrl}", IMAGE("${finalImageUrl}", 1))`;
                driveImageUrl = finalImageUrl;
            } else {
                displayThumb = `=HYPERLINK("${videoUrl}", "No Image")`;
                driveImageUrl = "取得制限あり";
            }

            if (!row[2]) row[2] = metaInfo.site;
            if (metaInfo.title && metaInfo.title !== "タイトル取得不可" && metaInfo.title !== "Instagram投稿") {
                if (!row[5] || !row[5].includes(metaInfo.title)) {
                    row[5] = row[5] ? `${row[5]}\n[${metaInfo.title}]` : `[${metaInfo.title}]`;
                }
            }
            if (!row[0]) row[0] = new Date();

            row[1] = displayThumb; 
            row[7] = driveImageUrl; 

            sheet.getRange(i + 1, 1, 1, 8).setValues([row]);
            Utilities.sleep(1500); 
        }
    }
}

// ------------------------------------------
// 共通ヘルパー関数
// ------------------------------------------
function saveRowToSheet(sheet, date, url, dancer, genre, memo) {
    const metaInfo = fetchWebInfo(url);
    let driveImageUrl = "";
    
    if (metaInfo.imageUrl && FOLDER_ID && metaInfo.imageUrl.startsWith("http")) {
        driveImageUrl = saveImageToDrive(metaInfo.imageUrl, metaInfo.title);
    }

    let displayThumb = "";
    let finalHValue = driveImageUrl;

    if (driveImageUrl) {
        displayThumb = `=HYPERLINK("${url}", IMAGE("${driveImageUrl}", 1))`;
    } else if (metaInfo.imageUrl && metaInfo.imageUrl.startsWith("http")) {
        displayThumb = `=HYPERLINK("${url}", IMAGE("${metaInfo.imageUrl}", 1))`;
        finalHValue = metaInfo.imageUrl;
    } else {
        displayThumb = `=HYPERLINK("${url}", "No Image")`;
        finalHValue = "取得制限あり";
    }

    let finalMemo = memo;
    if (metaInfo.title && metaInfo.title !== "タイトル取得不可" && metaInfo.title !== "Instagram投稿") {
        if (finalMemo) finalMemo += "\n";
        finalMemo += `[${metaInfo.title}]`;
    }

    sheet.appendRow([date, displayThumb, metaInfo.site, dancer, genre, finalMemo, url, finalHValue]);
}

function saveImageToDrive(imageUrl, title) {
    if (!imageUrl || !imageUrl.startsWith("http")) return "";
    try {
        const options = { 
          muteHttpExceptions: true,
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        };
        const response = UrlFetchApp.fetch(imageUrl, options);
        if (response.getResponseCode() === 200) {
            const blob = response.getBlob();
            let safeTitle = "thumb";
            if (title) safeTitle = title.substring(0, 15).replace(/[\\/:*?"<>|]/g, "_");
            blob.setName(`${safeTitle}_${new Date().getTime()}.jpg`);
            const folder = DriveApp.getFolderById(FOLDER_ID);
            const file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            return "https://drive.google.com/uc?export=view&id=" + file.getId();
        }
    } catch (e) { console.error("Save Image Error: " + e.message); }
    return "";
}

function fetchWebInfo(url) {
    let title = "タイトル取得不可";
    let siteName = "その他";
    let imageUrl = "";

    if (url.includes("youtu")) {
        siteName = "YouTube";
        try {
            let videoId = "";
            const m = url.match(/(v=|youtu\.be\/|shorts\/)([^&?/]+)/);
            if (m) {
                videoId = m[2];
                imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                title = "YouTube動画";
            }
        } catch (e) { }
    } else if (url.includes("instagram.com")) {
        siteName = "Instagram";
        title = "Instagram投稿";
        imageUrl = getInstagramImage(url); 
    } else {
        if (url.includes("twitter.com") || url.includes("x.com")) siteName = "X (Twitter)";
        try {
            const options = { muteHttpExceptions: true, headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } };
            const response = UrlFetchApp.fetch(url, options);
            if (response.getResponseCode() === 200) {
                const html = response.getContentText("UTF-8");
                const ogTitle = html.match(/property="og:title" content="([^"]+)"/i);
                if (ogTitle && ogTitle[1]) title = ogTitle[1].trim();
                const ogImage = html.match(/property="og:image" content="([^"]+)"/i);
                if (ogImage && ogImage[1]) imageUrl = ogImage[1].replace(/&amp;/g, "&");
            }
        } catch (e) { }
    }
    return { title: title, site: siteName, imageUrl: imageUrl };
}

// ------------------------------------------
// Instagram専用：画像取得ヘルパー関数 (完全補完版)
// ------------------------------------------
function getInstagramImage(url) {
    let targetUrl = url.split("?")[0];
    if (targetUrl.endsWith("/")) targetUrl = targetUrl.slice(0, -1);
    
    const match = targetUrl.match(/\/(p|reel|tv)\/([^\/]+)/);
    let shortcode = (match && match[2]) ? match[2] : "";
    let img = "";

    // 【パターン1】埋め込み(embed)ページからスクレイピング
    if (shortcode) {
        try {
            const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
            const options = { 
                muteHttpExceptions: true, 
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" } 
            };
            const response = UrlFetchApp.fetch(embedUrl, options);
            if (response.getResponseCode() === 200) {
                const html = response.getContentText();
                const patterns = [
                    /class="EmbeddedMediaImage"[^>]*src="([^"]+)"/,
                    /img class="[^"]+" src="([^"]+)"/,
                    /"thumbnail_src":"([^"]+)"/
                ];
                for (let p of patterns) {
                    const m = html.match(p);
                    if (m && m[1] && m[1].startsWith("http")) {
                        img = m[1].replace(/&amp;/g, "&").replace(/\\u0026/g, "&");
                        if (!img.includes("logging_page_id")) break;
                        else img = "";
                    }
                }
            }
        } catch (e) { }
    }

    // 【パターン2】外部API (Microlink) を利用
    if (!img) {
        try {
            const apiUrl = 'https://api.microlink.io/?url=' + encodeURIComponent(url);
            const response = UrlFetchApp.fetch(apiUrl, { muteHttpExceptions: true });
            if (response.getResponseCode() === 200) {
                const data = JSON.parse(response.getContentText());
                if (data.data && data.data.image && data.data.image.url) {
                    img = data.data.image.url;
                }
            }
        } catch(e) { }
    }

    // 【パターン3】通常のOGP
    if (!img) {
         try {
            const options = { muteHttpExceptions: true, headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } };
            const response = UrlFetchApp.fetch(targetUrl, options);
            if (response.getResponseCode() === 200) {
                const html = response.getContentText("UTF-8");
                const ogImage = html.match(/property="og:image" content="([^"]+)"/i);
                if (ogImage && ogImage[1]) img = ogImage[1].replace(/&amp;/g, "&");
            }
        } catch (e) { }
    }

    // 【パターン4】最終フォールバック
    if (!img) img = targetUrl + "/media/?size=l";

    return img;
}
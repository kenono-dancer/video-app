# How to Enable Saving (Google Service Account Setup)

The error "Write Error" happens because the app needs **secure permissions** to modify your Google Sheet. Following these steps will fix it.

## Step 1: Create Service Account
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a **New Project** (e.g., named "Dance App").
3. Search for **"Google Sheets API"** and **Enable** it.
   - Also search for **"Google Drive API"** and **Enable** it (recommended to avoid access issues).
4. Search for **"Service Accounts"** (in credentials or IAM).
5. **Create Service Account**:
    - Name: `dance-app-editor`
    - Grant role: **Editor** (Project > Editor).
6. Click on the created service account, go to **Keys** tab.
7. **Add Key** > **Create new key** > **JSON**.
8. A `.json` file will verify download to your computer.

## Step 2: Configure Secrets in App
1. Open the file `.streamlit/secrets.toml` in the app directory:
   `/Users/macbookpro2019/.gemini/antigravity/scratch/dance_video_app/.streamlit/secrets.toml`
   *(If it doesn't exist, create it inside the `.streamlit` folder)*.

2. Open your downloaded **JSON key file** with a text editor.
3. Copy the contents and paste them into `secrets.toml` in this format:

```toml
[connections.gsheets]
spreadsheet = "https://docs.google.com/spreadsheets/d/1szdhHLrIHF_uMDjIOJokPGsxm_7BbvhiT9iKxrYxtH8/edit?usp=drive_link"
type = "service_account"
project_id = "YOUR_PROJECT_ID"
private_key_id = "YOUR_PRIVATE_KEY_ID"
private_key = "-----BEGIN PRIVATE KEY-----...\n"
client_email = "dance-app-editor@..."
client_id = "..."
auth_uri = "https://accounts.google.com/o/oauth2/auth"
token_uri = "https://oauth2.googleapis.com/token"
auth_provider_x509_cert_url = "https://www.googleapis.com/oauth2/v1/certs"
client_x509_cert_url = "..."
```

**💡 Tip:** You can basically copy the simplified JSON content under `[connections.gsheets]`.

## Step 3: Share the Sheet (**Crucial**)
1. Open your downloaded JSON key again and find the `"client_email"` (e.g., `dance-app-editor@project.iam.gserviceaccount.com`).
2. Go to your **Google Sheet**.
3. Click **Share**.
4. Paste the **client email** and give it **Editor** access.
5. Click **Send**.

## Step 4: Restart App
Restart the app using `./run_app.sh` and try registering again.

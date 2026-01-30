
import streamlit as st
import traceback

try:
    import pandas as pd
    from streamlit_gsheets import GSheetsConnection
    import streamlit.components.v1 as components
    import unicodedata
    import ssl
    import pykakasi
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload
    import io

    # Fix for SSL: CERTIFICATE_VERIFY_FAILED on macOS
    # (Force rebuild trigger: 2026-01-29)
    try:
        _create_unverified_https_context = ssl._create_unverified_context
    except AttributeError:
        pass
    else:
        ssl._create_default_https_context = _create_unverified_https_context
except Exception as e:
    st.error("Startup Error: An error occurred during imports.")
    st.code(traceback.format_exc())
    st.stop()

# Continue with main app logic only if imports succeed

# -----------------------------------------------------------------------------
# Page Configuration & CSS
# -----------------------------------------------------------------------------
st.set_page_config(
    page_title="Dance Video Library",
    page_icon="💃",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for that extra "wow" factor
st.markdown("""
<style>
    /* Global Styles */
    .stApp {
        background-color: #0E1117;
    }
    
    /* Move Sidebar content up if possible to sit near the toggle */
    section[data-testid="stSidebar"] > div:first-child {
        padding-top: 1rem; 
    }

    
    /* Card Container */
    .dance-card {
        background-color: #1E1E1E;
        border-radius: 12px;
        padding: 0;
        margin-bottom: 20px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        transition: transform 0.3s ease, box-shadow 0.3s ease;
        overflow: hidden;
        border: 1px solid #333;
    }
    
    .dance-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 8px 12px rgba(0, 0, 0, 0.5);
        border-color: #E1BEE7;
    }
    
    /* Thumbnail Image */
    .dance-card img {
        width: 100% !important;
        height: 200px !important; /* Fixed height for consistent card size */
        display: block !important;
        object-fit: contain !important; /* Ensure full image is visible */
        background-color: #000 !important; /* Black background for letterboxing */
    }
    
    /* Card Content */
    .dance-card-content {
        padding: 12px;
    }
    
    .dance-title {
        color: #fff;
        font-weight: 600;
        font-size: 1.1rem;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    
    .dance-meta {
        color: #aaa;
        font-size: 0.9rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    
    .badge {
        background-color: #333;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.8rem;
        color: #E1BEE7;
    }

    /* Link behavior */
    a.card-link {
        text-decoration: none;
        color: inherit;
        display: block;
    }
    a.card-link:hover {
        text-decoration: none;
    }



</style>
""", unsafe_allow_html=True)

# -----------------------------------------------------------------------------
# Data Loading
# -----------------------------------------------------------------------------
# Public Google Sheet URL provided by user
SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1szdhHLrIHF_uMDjIOJokPGsxm_7BbvhiT9iKxrYxtH8/edit?usp=drive_link"

@st.cache_data(ttl=600)
def load_data():
    conn = st.connection("gsheets", type=GSheetsConnection)
    try:
        data = conn.read(spreadsheet=SPREADSHEET_URL)
        return data
    except Exception as e:
        st.error(f"Error loading data: {e}")
        st.info("If you see an authentication error, please ensure your Google Sheet is set to 'Anyone with the link' -> 'Viewer'.")
        return pd.DataFrame()

df = load_data()

# Check if dataframe is empty
if df.empty:
    st.warning("No data found or failed to load data.")
    st.stop()

# Basic cleaning: strip whitespace from column names just in case
df.columns = df.columns.str.strip()

# Expected columns: 'ダンサー', '種目', '画像URL', '動画URL', 'メモ'
# Adjust if necessary based on assumption
# Let's verify we have what we need, or fail gracefully. 
# We add 'メモ' as optional but preferred
required_cols = ['ダンサー', '種目', '画像URL', '動画URL']
missing_cols = [c for c in required_cols if c not in df.columns]
if missing_cols:
    st.error(f"Missing columns in the spreadsheet: {', '.join(missing_cols)}. Please check the sheet headers.")
    st.stop()

# Ensure Memo column (Col F / Index 5) exists
if 'メモ' not in df.columns:
    df['メモ'] = ""

# -----------------------------------------------------------------------------
# Google Drive Upload Helper
# -----------------------------------------------------------------------------
# Folder ID from GAS script
DRIVE_FOLDER_ID = "13fNsuwfvL3TKTawp8XlXM_fuPu63F1-d"

def upload_image_to_drive(file_obj, filename, folder_id=None):
    """Uploads a file object to Google Drive (via API or GAS Proxy) and returns the direct link."""
    try:
        # CHECK FOR GAS PROXY URL
        # If user has set up the proxy, use it (Workaround B)
        # Note: We check specifically for a secret or environment variable
        gas_url = None
        if "connections" in st.secrets and "gas_url" in st.secrets["connections"]:
             gas_url = st.secrets["connections"]["gas_url"]
        
        if gas_url:
            # OPTION B: GAS PROXY UPLOAD
            import requests
            import base64
            
            # Read file and encode
            file_content = file_obj.read()
            encoded_content = base64.b64encode(file_content).decode('utf-8')
            file_obj.seek(0) # Reset pointer
            
            # Use provided folder ID or fallback
            target_folder = folder_id if folder_id else DRIVE_FOLDER_ID
            
            payload = {
                'folder_id': target_folder,
                'filename': filename,
                'mimeType': file_obj.type,
                'file_content': encoded_content
            }
            
            response = requests.post(gas_url, data=payload)
            try:
                result = response.json()
            except Exception:
                st.error(f"GAS API Error. Status: {response.status_code}")
                with st.expander("Response Content (Debug)"):
                    st.text(response.text[:1000]) # Show first 1000 chars
                return None
            
            if "success" in result and result["success"]:
                return result["url"]
            else:
                st.error(f"GAS Upload Error: {result.get('error', 'Unknown Error')}")
                return None

        # OPTION A: DIRECT SERVICE ACCOUNT UPLOAD (Existing Logic)
        # ... (rest of function)

        # Load credentials from secrets
        conn_secrets = st.secrets["connections"]["gsheets"]
        creds = service_account.Credentials.from_service_account_info(
            conn_secrets,
            scopes=["https://www.googleapis.com/auth/drive.file"]
        )
        
        service = build('drive', 'v3', credentials=creds)
        
        # Use provided folder ID or fallback to global default (if valid)
        target_folder = folder_id if folder_id else DRIVE_FOLDER_ID
        
        file_metadata = {
            'name': filename,
            'parents': [target_folder]
        }
        
        media = MediaIoBaseUpload(file_obj, mimetype=file_obj.type, resumable=True)
        
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id',
            supportsAllDrives=True
        ).execute()
        
        file_id = file.get('id')
        
        # Make it public (Anyone with link can view)
        service.permissions().create(
            fileId=file_id,
            body={'role': 'reader', 'type': 'anyone'}
        ).execute()
        
        # Return the thumbnail link
        return f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"
        
    except Exception as e:
        error_msg = str(e)
        if "storageQuotaExceeded" in error_msg:
             st.error("Drive Error: Storage Quota Exceeded. Service Accounts have 0 bytes quota. Please setup GAS Proxy (Workaround B) or use a Workspace Shared Drive.")
        else:
             st.error(f"Drive Upload Error: {e}")
        return None
    if len(df.columns) >= 6:
        df.rename(columns={df.columns[5]: 'メモ'}, inplace=True)
    else:
        df['メモ'] = ""

# Ensure Platform/Site Name column (Col C / Index 2) exists
# User stated Column C is Site Name.
if len(df.columns) >= 3:
    # Rename Col 2 to 'platform' (internal use)
    # Check if 'platform' already exists to avoid conflict if headers match
    col_c = df.columns[2]
    if col_c != 'platform':
        df.rename(columns={col_c: 'platform'}, inplace=True)
else:
    df['platform'] = "YouTube" # Default fallback

df['メモ'] = df['メモ'].fillna("").astype(str)
df['platform'] = df['platform'].fillna("YouTube").astype(str)

# DEBUG: Check Memo Data
# with st.sidebar.expander("Debug: Data Inspector"):
#     st.write("Columns:", df.columns.tolist())
#     st.write("Memo Content (First 5):")
#     st.write(df['メモ'].head(5))
#     st.write("Raw DF Head:")
#     st.dataframe(df.head(3))

# -----------------------------------------------------------------------------
# Sidebar & Filtering
# -----------------------------------------------------------------------------
st.sidebar.markdown("---")
# view_mode removed from here

st.sidebar.title("Filter Options")



# Dancer Filter
all_dancers = sorted(df['ダンサー'].dropna().unique())
selected_dancers = st.sidebar.multiselect("Dancer", all_dancers, key="filter_dancer")

# Discipline Filter with Custom Order (W, T, F, Q, V, Other)
raw_disciplines = df['種目'].dropna().unique()
discipline_order = {'W': 0, 'T': 1, 'F': 2, 'Q': 3, 'V': 4, 'Other': 5}
all_disciplines = sorted(raw_disciplines, key=lambda x: discipline_order.get(x, 99))

selected_disciplines = st.sidebar.multiselect("Dance", all_disciplines, key="filter_discipline")

# Free Word Search with Suggestions (from Memo)
# Build Vocabulary
unique_words = set()
for memo in df['メモ']:
    # Simple tokenization: split by space, full-width space, commas
    # Japanese text might need more complex tokenization (e.g. MeCab) for perfect results,
    # but simple splitting works for "tags" or space-separated keywords.
    # We will just split by standard separators for now.
    import re
    # Split by space, comma, dot, newlines
    tokens = re.split(r'[\s,、。]+', memo)
    unique_words.update([t for t in tokens if t])

sorted_vocab = sorted(list(unique_words))
search_keywords = st.sidebar.multiselect("Search", sorted_vocab, key="filter_search")


# Apply filters
filtered_df = df.copy()

if selected_dancers:
    filtered_df = filtered_df[filtered_df['ダンサー'].isin(selected_dancers)]

if selected_disciplines:
    filtered_df = filtered_df[filtered_df['種目'].isin(selected_disciplines)]

if search_keywords:
    # Filter: Keep row if ANY of the selected keywords appear in the 'メモ' column
    # (or you could require ALL, but usually ANY is friendlier for tags, 
    #  UNLESS user wants to narrow down. Let's do AND logic for narrowing down)
    
    # AND logic: Row must contain ALL selected keywords
    for keyword in search_keywords:
         filtered_df = filtered_df[filtered_df['メモ'].str.contains(keyword, case=False, na=False)]

# -----------------------------------------------------------------------------
# Registration Form (Sidebar)
# -----------------------------------------------------------------------------
from st_keyup import st_keyup

st.sidebar.markdown("---")
with st.sidebar.expander("➕ Add"):
    # Dancer Input
    if "reg_dancer_key_ver" not in st.session_state: st.session_state["reg_dancer_key_ver"] = 0
    
    def apply_dancer_suggestion():
        if st.session_state.get("reg_dancer_pills"):
            st.session_state["reg_dancer_value"] = st.session_state.reg_dancer_pills
            st.session_state["reg_dancer_key_ver"] += 1

    current_dancer_key = f"reg_dancer_keyup_{st.session_state['reg_dancer_key_ver']}"
    default_dancer_val = st.session_state.get("reg_dancer_value", "")

    dancer_val = st_keyup("Dancer Name", value=default_dancer_val, key=current_dancer_key, placeholder="Ex: Riccardo & Yulia")
    
    matches = []
    if dancer_val:
        matches = [d for d in all_dancers if dancer_val.lower() in d.lower()]
        matches = [m for m in matches if m != dancer_val]
    
    if matches:
        st.pills("Suggestions", matches, selection_mode="single", key="reg_dancer_pills", on_change=apply_dancer_suggestion, label_visibility="collapsed")

    # Discipline Input
    new_discipline = st.selectbox("Dance", ['W', 'T', 'F', 'Q', 'V', 'S', 'C', 'R', 'P', 'J', 'Other'])

    # Media & Memo
    # No columns in sidebar to avoid cramping
    new_img_url = st.text_input("Image URL", placeholder="Empty for auto-YouTube", help="Leave empty to auto-generate")
    new_video_url = st.text_input("Video URL", placeholder="https://youtu.be/...")
    
    # Memo Input
    if "reg_memo_key_ver" not in st.session_state: st.session_state["reg_memo_key_ver"] = 0

    def apply_memo_suggestion():
          if st.session_state.get("reg_memo_pills"):
             old_key = f"reg_memo_keyup_{st.session_state['reg_memo_key_ver']}"
             current_val = st.session_state.get(old_key, "")
             added = st.session_state.reg_memo_pills
             if current_val:
                 new_val = current_val + " " + added
             else:
                 new_val = added
             st.session_state["reg_memo_value"] = new_val
             st.session_state["reg_memo_key_ver"] += 1

    current_memo_key = f"reg_memo_keyup_{st.session_state['reg_memo_key_ver']}"
    default_memo_val = st.session_state.get("reg_memo_value", "")
    
    new_memo = st_keyup("Memo", value=default_memo_val, key=current_memo_key, placeholder="Keywords...")
    
    memo_matches = []
    if new_memo:
        tokens = new_memo.split()
        if tokens:
            last_token = tokens[-1]
            memo_matches = [w for w in sorted_vocab if last_token.lower() in w.lower() and last_token != w]
    
    if memo_matches:
         st.pills("Tags", memo_matches, selection_mode="single", key="reg_memo_pills", on_change=apply_memo_suggestion, label_visibility="collapsed")
    
    if st.button("Register", type="primary"):
        # Validation and Submission
        final_dancer = dancer_val
        if not final_dancer:
             st.error("Dancer Name Required")
        elif not new_video_url:
            st.error("Video URL Required")
        else:
            if not new_img_url and new_video_url:
                generated_thumb = get_thumbnail_url(new_video_url)
                if generated_thumb: new_img_url = generated_thumb
            
            new_row = pd.DataFrame([{
                "ダンサー": final_dancer,
                "種目": new_discipline,
                "画像URL": new_img_url,
                "動画URL": new_video_url,
                "メモ": new_memo
            }])
            try:
                conn = st.connection("gsheets", type=GSheetsConnection)
                conn.update(spreadsheet=SPREADSHEET_URL, data=pd.concat([df, new_row], ignore_index=True))
                st.success(f"Registered: {final_dancer}")
                st.cache_data.clear()
                # Clear inputs
                if "reg_dancer_keyup" in st.session_state: del st.session_state.reg_dancer_keyup
                if "reg_memo_keyup" in st.session_state: del st.session_state.reg_memo_keyup
                if "reg_dancer_pills" in st.session_state: del st.session_state.reg_dancer_pills
                st.rerun()
            except Exception as e:
                st.error(f"Error: {e}")

# -----------------------------------------------------------------------------
# Sorting Logic
# -----------------------------------------------------------------------------
# Sort Option - REMOVED from Sidebar, will use Tabs in Main Content
# sort_option = st.sidebar.radio("並び順 (Sort Order)", ["ダンサー名順 (Dancer)", "種目順 (Discipline)"], index=0)


# Edit Mode Toggle
st.sidebar.markdown("---")
edit_mode = st.sidebar.toggle("🔧 Edit Mode", value=False)

st.sidebar.markdown("---")
# Reload Data Button (Manual Refresh) - Moved to bottom
if st.sidebar.button("Reload Data"):
    st.cache_data.clear()
    st.rerun()

# Order: W, T, F, Q, V, then others alphabetically (or just appended)
priority_order = {'W': 0, 'T': 1, 'F': 2, 'Q': 3, 'V': 4}

def get_sort_key(discipline):
    d = str(discipline).strip()
    return priority_order.get(d, 5), d

# Create temporary columns for sorting
filtered_df['sort_rank'] = filtered_df['種目'].apply(lambda x: get_sort_key(x)[0])
filtered_df['sort_name'] = filtered_df['種目'].apply(lambda x: get_sort_key(x)[1])

# Sorting logic moved to Tabs section
# filtered_df = filtered_df.sort_values(...) -> handled in Tabs

# -----------------------------------------------------------------------------
# Main Content
# -----------------------------------------------------------------------------
# ... (Dialogs kept as is) ...
# -----------------------------------------------------------------------------
# Dialogs (Modals)
# -----------------------------------------------------------------------------
@st.dialog("動画情報の編集 (Edit Video)")
def edit_video_dialog(index, row_data):
    # Using a form to bundle the inputs
    with st.form("edit_form"):
        e_dancer = st.text_input("ダンサー (Dancer)", value=row_data['ダンサー'])
        # Simplified selectbox for consistency
        disciplines = ['W', 'T', 'F', 'Q', 'V', 'S', 'C', 'R', 'P', 'J', 'Other']
        current_disc = row_data['種目'] if row_data['種目'] in disciplines else 'Other'
        e_discipline = st.selectbox("Dance", disciplines, index=disciplines.index(current_disc))
        
        e_img_url = st.text_input("画像URL (Image URL)", value=row_data['画像URL'])
        e_video_url = st.text_input("動画URL (Video URL)", value=row_data['動画URL'])
        e_memo = st.text_area("メモ (Memo)", value=row_data['メモ'])
        
        # --- File Uploader ---
        st.markdown("---")
        st.markdown("**サムネイル画像のアップロード (Upload Thumbnail)**")
        st.caption("画像をアップロードすると、上記のURL入力欄より優先されます。(Uploaded image takes priority)")
        
        drive_folder_input = st.text_input("Google Drive Folder ID (Optional)", placeholder="Leave empty to use default", help="共有フォルダIDを指定してください。")
        uploaded_file = st.file_uploader("Choose an image...", type=['jpg', 'jpeg', 'png'])
        
        submitted = st.form_submit_button("更新 (Update)")
        
        if submitted:
            # Update logic
            try:
                final_img_url = e_img_url
                
                # Handle File Upload
                if uploaded_file is not None:
                    with st.spinner("Uploading to Google Drive..."):
                        # Use a safe filename
                        import datetime
                        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
                        safe_name = f"manual_{timestamp}_{uploaded_file.name}"
                        drive_link = upload_image_to_drive(uploaded_file, safe_name, folder_id=drive_folder_input)
                        
                        if drive_link:
                            final_img_url = drive_link
                            st.success("画像アップロード成功！ (Image Uploaded)")
                        else:
                            st.error("画像アップロードに失敗しました (Upload Failed)")
                            st.stop() # Stop update if upload failed

                conn = st.connection("gsheets", type=GSheetsConnection)
                curr_df = conn.read(spreadsheet=SPREADSHEET_URL)
                
                # Update the specific row
                curr_df.at[index, 'ダンサー'] = e_dancer
                curr_df.at[index, '種目'] = e_discipline
                curr_df.at[index, '画像URL'] = final_img_url # Use final URL
                curr_df.at[index, '動画URL'] = e_video_url
                curr_df.at[index, 'メモ'] = e_memo
                
                conn.update(spreadsheet=SPREADSHEET_URL, data=curr_df)
                st.success("更新しました！ (Updated!)")
                st.cache_data.clear()
                st.rerun()
            except Exception as e:
                st.error(f"Error: {e}")

@st.dialog("動画の削除 (Delete Video)")
def delete_video_dialog(index, title):
    st.warning(f"本当に削除しますか？ (Are you sure you want to delete form list?)\n\n**{title}**")
    if st.button("削除実行 (Delete)", type="primary"):
         try:
            conn = st.connection("gsheets", type=GSheetsConnection)
            curr_df = conn.read(spreadsheet=SPREADSHEET_URL)
            
            # Drop the row
            updated_df = curr_df.drop(index)
            
            conn.update(spreadsheet=SPREADSHEET_URL, data=updated_df)
            st.success("削除しました (Deleted)")
            st.cache_data.clear()
            st.rerun()
         except Exception as e:
            st.error(f"Error: {e}")

# Callback to clear filters safely
def clear_filters():
    if "filter_dancer" in st.session_state: st.session_state["filter_dancer"] = []
    if "filter_discipline" in st.session_state: st.session_state["filter_discipline"] = []
    if "filter_search" in st.session_state: st.session_state["filter_search"] = []
    st.cache_data.clear()

# -----------------------------------------------------------------------------
# Main Content
# -----------------------------------------------------------------------------
col_header, col_reset = st.columns([3, 1])
with col_header:
    st.title("Dance Video Library")
with col_reset:
    # Use on_click callback to handle state updates before the rerun loop
    if st.button("Home / Reset", use_container_width=True, on_click=clear_filters):
        pass # The callback handles the logic, and the button click triggers a rerun automatically

# Auto-thumbnail helper
def get_thumbnail_url(video_url):
    import re
    if not video_url:
        return ""
    # Regex to capture the 11-char ID
    regex = r'(?:v=|\/|be\/|embed\/)([0-9A-Za-z_-]{11})'
    match = re.search(regex, video_url)
    if match:
        video_id = match.group(1)
        return f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
    return ""

# --- Registration Form (Interactive / No Form Wrapper for Autocomplete) ---


st.markdown(f"Showing {len(filtered_df)} videos")

# Grid Layout (3 columns)
# -----------------------------------------------------------------------------
# Grid Renderer Function
# -----------------------------------------------------------------------------
def render_video_grid(df_subset):
    if df_subset.empty:
        st.write("No videos found.")
        return

    # Batch into rows of 3 to ensure correct order on mobile (Row 0, then Row 1...)
    # Current Streamlit columns stack vertically on mobile (Col 0 all, then Col 1 all).
    # Breaking into rows prevents "jumping" numbers.
    
    N_COLS = 3
    rows = [df_subset.iloc[i:i+N_COLS] for i in range(0, len(df_subset), N_COLS)]
    
    for row_chunk in rows:
        cols = st.columns(N_COLS)
        for i in range(len(row_chunk)):
            row = row_chunk.iloc[i]
            col = cols[i]
            
            # Use _original_index if present
            if '_original_index' in df_subset.columns:
                 original_idx = row['_original_index']
            else:
                 original_idx = row.name
    
            dancer = row['ダンサー']
            discipline = row['種目']
            img_url = row['画像URL']
            video_url = row['動画URL']
        
            # Robust access to Memo
            try:
                raw_memo = row.get('メモ', "")
            except:
                raw_memo = ""
                
            memo_full = str(raw_memo) if raw_memo is not None else ""
            if memo_full.lower() == "nan": 
                memo_full = ""
            
            # Extract Memo
            # User request: "2nd line only". 
            # Issue: User reported "Not displayed". Possibly data has only 1 line.
            # Fix: Try 2nd line. If not available, fallback to 1st line (so something shows).
            memo_lines = memo_full.splitlines()
            if len(memo_lines) >= 2:
                memo = memo_lines[1].strip()
            elif len(memo_lines) == 1:
                memo = memo_lines[0].strip()
            else:
                memo = "" 
            
            # Prepare memo HTML block conditionally (Flattened HTML)
            memo_html = ""
            if memo:
                memo_html = f'<div style="font-size:0.8rem; color:#aaa; margin-bottom:4px; line-height:1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{memo}</div>'
            
            # Get Platform Name for Badge (Column C)
            platform_name = row.get('platform', 'YouTube')
            if not platform_name or str(platform_name).lower() == 'nan':
                 platform_name = 'YouTube'

            with col:
                # Flattened Card HTML to prevent Markdown code block issues
                card_html = f"""<a href="{video_url}" target="_blank" class="card-link"><div class="dance-card"><div style="width:100%; height:200px; overflow:hidden; position:relative;"><img src="{img_url}" alt="{dancer}" onerror="this.onerror=null; this.src='https://via.placeholder.com/320x180.png?text=No+Image'" style="width:100%; height:100%; object-fit:cover;"></div><div class="dance-card-content"><div class="dance-title">{dancer}</div>{memo_html}<div class="dance-meta"><span>{discipline}</span><span class="badge" style="font-size:0.75rem; background:#CC0000; color=white;">{platform_name}</span></div></div></div></a>"""
                
                st.markdown(card_html, unsafe_allow_html=True)
                
                # Show buttons only if Edit Mode is ON
                if edit_mode:
                    # Using sub-columns might break layout if width is small, but let's try
                    b_col1, b_col2 = st.columns(2)
                    with b_col1:
                        if st.button("✏️ 編集", key=f"edit_{original_idx}"):
                            edit_video_dialog(original_idx, row.to_dict())
                    with b_col2:
                        if st.button("🗑️ 削除", key=f"del_{original_idx}"):
                            delete_video_dialog(original_idx, f"{dancer} - {discipline}")

# -----------------------------------------------------------------------------
# Layout Logic based on Sort Mode
# -----------------------------------------------------------------------------
# -----------------------------------------------------------------------------
# -----------------------------------------------------------------------------
# Layout Logic based on View Mode (Fixed Radio)
# -----------------------------------------------------------------------------
# Place Radio in Main Layout but style it fixed
view_mode = st.radio("View Mode", ["Latest", "By Dancer", "By Dance"], horizontal=True, label_visibility="collapsed")

# Custom CSS to Fix Position to Top-Left Header (Next to Toggle)
st.markdown("""
<style>
    /* Position the Radio Container in the Header area */
    div[data-testid="stRadio"] {
        position: fixed !important;
        top: 18px !important; /* Align with the sidebar toggle */
        left: 70px !important; /* To the right of the toggle */
        z-index: 1000000 !important;
        width: auto !important;
        background-color: transparent !important;
        border: none !important;
        padding: 0 !important;
    }
    
    /* Horizontal layout */
    div[role="radiogroup"] {
        display: flex;
        flex-direction: row;
        gap: 15px;
    }

    /* Hide the default radio circle */
    div[data-testid="stRadio"] label > div:first-child {
        display: none;
    }

    /* Style the labels to look like text links */
    div[data-testid="stRadio"] label {
        background-color: transparent !important;
        border: none !important;
        color: #888 !important; /* Inactive color */
        font-weight: 600;
        cursor: pointer;
        padding: 0 !important;
        margin: 0 !important;
        transition: color 0.2s;
        font-size: 1rem;
    }
    
    /* Hover state */
    div[data-testid="stRadio"] label:hover {
        color: #fff !important;
    }

    /* Selected State (Underline) */
    div[data-testid="stRadio"] label:has(input:checked) {
        border-bottom: 2px solid #FF8C00 !important;
        color: white !important;
    }
    
    /* Robust "Selected" styling is hard without stable classes. 
       Let's just make them look good. 
       We can assume the user knows which is active by the view.
       But let's try to target the active one.
       Usually the active radio has aria-checked="true" on the input.
    */

    /* Button Styles (Primary -> Orange) */
    div.stButton > button[kind="primary"] {
        background-color: #FF8C00 !important;
        border-color: #FF8C00 !important;
        color: white !important;
    }
    div.stButton > button[kind="primary"]:hover {
        background-color: #E67E00 !important;
        border-color: #E67E00 !important;
    }

    /* Footer */
    .footer {
        position: fixed;
        left: 0;
        bottom: 0;
        width: 100%;
        background-color: #0E1117;
        color: #888;
        text-align: center;
        padding: 10px;
        font-size: 0.8rem;
        border-top: 1px solid #333;
        z-index: 999;
    }

</style>
""", unsafe_allow_html=True)

# Helper for Gojyuon Sort (Define once)
@st.cache_resource
def get_kakasi():
    kks = pykakasi.kakasi()
    return kks

kks = get_kakasi()

def get_yomi(text):
    if not text: return ""
    result = kks.convert(text)
    return "".join([item['kana'] for item in result])

if view_mode == "By Dancer":
    # Sort by Dancer Name: Alphabet (English) First, then Gojyuon (Japanese)
    import unicodedata
    
    # Helper for Yomi (Normalization)
    def get_yomi_normalized(text):
        if not text: return ""
        # Normalize to half-width (NFKC) -> Strip whitespace
        normalized = unicodedata.normalize('NFKC', str(text)).strip()
        if not normalized: return ""
        
        # If it starts with Latin character, return lower case (ASCII < Kana)
        # This naturally puts English first.
        if 'a' <= normalized[0].lower() <= 'z':
             return normalized.lower()
        
        # Else use kakasi for Gojyuon
        return get_yomi(normalized)

    # Add temporary columns for sorting
    df_dancer_sorted = filtered_df.copy()
    df_dancer_sorted['yomi_key'] = df_dancer_sorted['ダンサー'].apply(get_yomi_normalized)
    
    # Sort purely by (YomiKey) - Ignoring Discipline Rank as per "Dancer Name" criterion
    df_dancer_sorted = df_dancer_sorted.sort_values(by=['yomi_key'])
    
    # Store original index for Edit/Delete actions, then reset index for display order
    df_dancer_sorted['_original_index'] = df_dancer_sorted.index
    df_dancer_sorted = df_dancer_sorted.reset_index(drop=True)
    
    # Render Groups by Dancer
    # We use sort=False to preserve the custom sort order we just applied
    # Remove standard groupby. We need custom grouping by initial.
    
    # Apply sorting (Already done via yomi_key, but we need the raw list for iteration if not using groupby)
    # Actually, let's use the sorted dataframe.
    dancers = df_dancer_sorted['ダンサー'].unique().tolist()
    
    # --------------------------------------------------------------------------------
    # Alphabet Index Logic & UI
    # --------------------------------------------------------------------------------
    
    # 1. Prepare Data: Group dancers by initial
    dancer_groups = {}
    sorted_initials = []
    
    # kks is initialized globally
    conv = kks.getConverter()

    for dancer in dancers:
        # Get first character
        if not isinstance(dancer, str) or not dancer:
            initial = "?"
            # Skip invalid entries or handle them
        else:
            # Convert to romaji to handle Kanji/Kana names correctly
            try:
                romaji = conv.do(dancer)
            except Exception:
                romaji = None
        if not romaji:
            initial = "?"
        else:
            initial = romaji[0].upper()
            
        # Group non-alpha into '#'
        if not initial.isalpha():
            initial = "#"
            
        if initial not in dancer_groups:
            dancer_groups[initial] = []
        dancer_groups[initial].append(dancer)
        
    sorted_initials = sorted(dancer_groups.keys())
    # Ensure '#' is last
    if '#' in sorted_initials:
        sorted_initials.remove('#')
        sorted_initials.append('#')

    # 2. Inject HTML/CSS/JS for the Index Bar via Iframe (Components)
    # This allows robust JS execution to target window.parent.document
    
    # Calculate height based on number of chars to fit snugly
    # roughly 20px per char + padding
    index_height = len(sorted_initials) * 20 + 40
    if index_height > 600: index_height = 600

    index_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
    <style>
        body {{
            margin: 0;
            padding: 0;
            background: transparent;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
        }}
        .alphabet-index {{
            display: flex;
            flex-direction: column;
            background-color: rgba(20, 20, 20, 0.9);
            border-radius: 12px;
            padding: 8px 4px; /* Slightly wider */
            box-shadow: 0 2px 5px rgba(0,0,0,0.5);
            max-height: 95vh;
            overflow-y: auto;
            width: 32px;
            
            /* Hide scrollbar */
            -ms-overflow-style: none;
            scrollbar-width: none;
        }}
        .alphabet-index::-webkit-scrollbar {{
            display: none;
        }}
        .index-char {{
            padding: 2px 0;
            font-size: 11px;
            color: #ccc;
            text-align: center;
            cursor: pointer;
            font-weight: bold;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            user-select: none;
            -webkit-user-select: none;
            touch-action: none; /* Crucial for custom touch handling */
        }}
        .index-char:hover, .index-char:active, .index-char.active {{
            color: #FF8C00;
            transform: scale(1.4);
        }}
    </style>
    </head>
    <body>
    <div class="alphabet-index" id="alphabetIndex">
        {''.join([f'<div class="index-char" data-target="anchor-{char}">{char}</div>' for char in sorted_initials])}
    </div>

    <script>
        const indexContainer = document.getElementById('alphabetIndex');
        
        // Helper to find parent element
        function getParentElement(id) {{
            // Streamlit apps are often in nested iframes, but usually window.parent.document works 
            // if we are just one level deep (standard components).
            // NOTE: Cross-origin restrictions might apply if Streamlit Cloud serves components from different domain.
            // But usually simple components are same-origin or sandboxed in allowed way.
            return window.parent.document.getElementById(id);
        }}

        function scrollTargetIntoView(targetId) {{
            const el = getParentElement(targetId);
            if (el) {{
                el.scrollIntoView({{behavior: "smooth", block: "start"}});
            }} else {{
                console.log("Element not found:", targetId);
            }}
        }}

        // Click
        indexContainer.addEventListener('click', (e) => {{
            if (e.target.classList.contains('index-char')) {{
                const targetId = e.target.getAttribute('data-target');
                scrollTargetIntoView(targetId);
            }}
        }});
        
        // Touch Slide (Touch Move)
        indexContainer.addEventListener('touchmove', (e) => {{
            e.preventDefault(); 
            const touch = e.touches[0];
            
            // elementFromPoint works relative to the viewport. 
            // Since we are in an iframe, clientX/Y are relative to the iframe.
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            
            if (target && target.classList.contains('index-char')) {{
                const targetId = target.getAttribute('data-target');
                // Use 'auto' behavior for sliding to avoid lag
                const el = getParentElement(targetId);
                if (el) {{
                     el.scrollIntoView({{behavior: "auto", block: "start"}});
                }}
            }}
        }}, {{passive: false}});
    </script>
    </body>
    </html>
    """
    
    # We place this component in a sidebar or floating div?
    # Streamlit components render in flow. To make it "Fixed", we need to inject CSS into the main app 
    # to position this specific iframe component, OR the component itself has fixed position logic?
    # Actually, components are iframes. We can't escape the iframe bounds easily to be "fixed" on screen 
    # unless we use Custom CSS in the main app to position the iframe container.
    
    # Strategy: 
    # 1. Custom CSS in main app to position the specific div wrapping the component.
    #    The component wrapper usually has a class like `stHtml`.
    #    It's risky to target generically.
    #    Better: Put the component in the sidebar? Data is "fixed" right.
    #    Wait, the user wants it on the RIGHT edge of screen.
    #    Standard sidebar is Left.
    
    # Better Strategy (Hybrid):
    # Use st.markdown to inject a DIV that acts as a container at fixed position.
    # INSIDE that div, we need the scripting capability.
    # But st.markdown script is sandboxed or ineffective for scrolling.
    
    # Re-evaluation:
    # If st.markdown script CANNOT scroll parent, we are stuck.
    # BUT, many Streamlit users use `window.parent.document` inside `st.components.v1.html`.
    # The problem is `st.components.v1.html` creates a block in the layout flow.
    # We want it FLOATING on the right.
    
    # Solution:
    # Use `st.markdown` to Inject CSS that targets the iframe generated by `components.html`.
    # Can we target the *last* iframe or specific iframe? Hard.
    
    # FASTEST Fix for "Scroll not working" in `st.markdown` approach:
    # It might be `window.parent` is needed EVEN IN `st.markdown` if Streamlit wraps it?
    # No, usually `st.markdown` is in the DOM.
    # Let's try to update the Script to use `window.parent` catch-all AND `document` catch-all.
    # AND `window.top`.
    
    # Let's revert to st.markdown BUT robustify the JS.
    # Why? Component iframe positioning is a nightmare (`z-index` wars with Streamlit UI).
    # `st.markdown` with `position: fixed` worked VISUALLY.
    # The issue is JS execution context.
    
    # Let's stick to st.markdown but use `window.top` and `window.parent` and `document`.
    
    index_bar_html = f"""
    <style>
        .alphabet-index {{
            position: fixed;
            right: 5px; 
            top: 55%;
            transform: translateY(-50%);
            display: flex;
            flex-direction: column;
            z-index: 999999; /* Super high z-index */
            background-color: rgba(20, 20, 20, 0.9);
            border-radius: 12px;
            padding: 8px 2px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.5);
            max-height: 80vh;
            overflow-y: auto;
            width: 36px;
            -ms-overflow-style: none;
            scrollbar-width: none;
            touch-action: none;
        }}
        .alphabet-index::-webkit-scrollbar {{
            display: none;
        }}
        .index-char {{
            padding: 3px 0;
            font-size: 11px;
            color: #ddd;
            text-align: center;
            cursor: pointer;
            font-weight: bold;
            font-family: sans-serif;
            user-select: none;
            -webkit-user-select: none;
        }}
        .index-char:hover, .index-char:active {{
            color: #FF8C00;
            transform: scale(1.3);
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 50%;
        }}
    </style>

    <div class="alphabet-index" id="alphabetIndex">
        {''.join([f'<div class="index-char" data-target="anchor-{char}">{char}</div>' for char in sorted_initials])}
    </div>

    <script>
        // Use an IIFE to avoid polluting global namespace but ensure execution
        (function() {{
            const indexContainer = document.getElementById('alphabetIndex');
            if (!indexContainer) return;

            function getTarget(id) {{
                // Try current document
                let el = document.getElementById(id);
                if (el) return el;
                // Try parent (Streamlit Cloud often runs app in an iframe)
                try {{
                    if (window.parent && window.parent.document) {{
                        el = window.parent.document.getElementById(id);
                        if (el) return el;
                    }}
                }} catch(e) {{}}
                return null;
            }}

            function scrollToId(targetId) {{
                const el = getTarget(targetId);
                if (el) {{
                    el.scrollIntoView({{behavior: "auto", block: "start", inline: "nearest"}});
                }} else {{
                    console.log("Target not found " + targetId);
                }}
            }}
            
            // Pointer Down / Click
            indexContainer.addEventListener('click', (e) => {{
                if (e.target.classList.contains('index-char')) {{
                    const targetId = e.target.getAttribute('data-target');
                    scrollToId(targetId);
                }}
            }});
            
            // Touch Move (Slide)
            indexContainer.addEventListener('touchmove', (e) => {{
                e.preventDefault(); 
                const touch = e.touches[0];
                const target = document.elementFromPoint(touch.clientX, touch.clientY);
                
                if (target && target.classList.contains('index-char')) {{
                    const targetId = target.getAttribute('data-target');
                    scrollToId(targetId);
                }}
            }}, {{passive: false}});
        }})();
    </script>
    """
    st.markdown(index_bar_html, unsafe_allow_html=True)

    # 3. Render content with Anchor Headers
    for initial in sorted_initials:
        # Initial Header with Anchor
        st.markdown(f"""
            <div id="anchor-{initial}" style="
                padding-top: 60px; 
                margin-top: -30px; 
                border-bottom: 2px solid #444; 
                margin-bottom: 10px;
                font-size: 18px; 
                font-weight: bold; 
                color: #FF8C00;">
                {initial}
            </div>
            """, unsafe_allow_html=True)
            
        current_group = dancer_groups[initial]
        
        for dancer in current_group:
            with st.expander(f"{dancer}", expanded=False):
                # Filter original DF by dancer to get videos
                sub_df = filtered_df[filtered_df['ダンサー'] == dancer]
                render_video_grid(sub_df)

elif view_mode == "By Dance":
    # Sort by rank(Discipline), then by Dancer
    
    # Continuous List View with Header Links
    targets = ["W", "T", "F", "Q", "V", "Other"]
    
    # Create Sticky Header / Menu
    # Stylish Button-like Links using HTML/CSS
    nav_html = """
    <style>
        .nav-container {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            padding: 10px;
            background: #1E1E1E;
            border-radius: 12px;
            border: 1px solid #333;
            overflow-x: auto;
        }
        .nav-pill {
            text-decoration: none;
            color: #fff;
            background-color: #333;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: 600;
            white-space: nowrap;
            transition: all 0.2s ease;
            border: 1px solid transparent;
        }
        .nav-pill:hover {
            background-color: #555;
            color: #E1BEE7;
            transform: translateY(-2px);
            border-color: #E1BEE7;
            text-decoration: none;
        }
        .nav-pill:active {
            transform: translateY(0);
        }
    </style>
    <div class="nav-container">
    """
    for t in targets:
        nav_html += f'<a href="#{t.lower()}" class="nav-pill">{t}</a>'
    nav_html += "</div>"
    
    st.markdown(nav_html, unsafe_allow_html=True)
    
    for target in targets:
        st.header(target, anchor=target.lower())
        
        if target == "Other":
            sub_df = filtered_df[~filtered_df['種目'].isin(["W", "T", "F", "Q", "V"])]
        else:
            sub_df = filtered_df[filtered_df['種目'] == target]
        
        # Sort sub_df by dancer for cleanliness
        sub_df = sub_df.sort_values(by=['ダンサー'])
        
        render_video_grid(sub_df)
        st.markdown("---")



elif view_mode == "Latest":
    # Reverse order: Show new items (bottom of sheet) first
    # filtered_df matches sheet order by default (minus filtering).
    # Just reverse it.
    df_latest = filtered_df.iloc[::-1]
    
    # Store original index if not present (though it likely is from filtering copy if we did it right, 
    # but let's ensure we can edit safely)
    if '_original_index' not in df_latest.columns:
        df_latest['_original_index'] = df_latest.index
        
    render_video_grid(df_latest)

# Spacer to ensure content isn't hidden behind fixed footer
st.write("")
st.write("")
st.write("")

# Force Refresh Button (Visible at bottom of list)
col_ref1, col_ref2 = st.columns([4, 2])
with col_ref2:
    if st.button("🔄 データ更新 / Reload", key="footer_reload", use_container_width=True):
        st.cache_data.clear()
        st.rerun()

# Footer Component
st.markdown('<div class="footer">ITxDancer by Ken Ono | v1.2</div>', unsafe_allow_html=True)

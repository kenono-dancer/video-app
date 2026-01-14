
import streamlit as st
import pandas as pd
from streamlit_gsheets import GSheetsConnection
import ssl

# Fix for SSL: CERTIFICATE_VERIFY_FAILED on macOS
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

# -----------------------------------------------------------------------------
# Page Configuration & CSS
# -----------------------------------------------------------------------------
st.set_page_config(
    page_title="Dance Video Manager",
    page_icon="💃",
    layout="wide",
)

# Custom CSS for that extra "wow" factor
st.markdown("""
<style>
    /* Global Styles */
    .stApp {
        background-color: #0E1117;
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
        width: 100%;
        height: auto;
        display: block;
        object-fit: cover;
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

# Ensure Memo column exists, fill with empty string if not
if 'メモ' not in df.columns:
    # Try to find it by index if naming fails, F column is index 5
    if len(df.columns) >= 6:
        # Rename the 6th column to 'メモ'
        df.rename(columns={df.columns[5]: 'メモ'}, inplace=True)
    else:
        df['メモ'] = ""

df['メモ'] = df['メモ'].fillna("").astype(str)

# -----------------------------------------------------------------------------
# Sidebar & Filtering
# -----------------------------------------------------------------------------
st.sidebar.title("Filter Options")

# Dancer Filter
all_dancers = sorted(df['ダンサー'].dropna().unique())
selected_dancers = st.sidebar.multiselect("ダンサー (Dancer)", all_dancers, key="filter_dancer")

# Discipline Filter (Sorting logic applied later, here just list unique)
all_disciplines = sorted(df['種目'].dropna().unique())
selected_disciplines = st.sidebar.multiselect("種目 (Discipline)", all_disciplines, key="filter_discipline")

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
search_keywords = st.sidebar.multiselect("フリーワード検索 (Search)", sorted_vocab, key="filter_search")


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
# Sorting Logic
# -----------------------------------------------------------------------------
# Sort Option - REMOVED from Sidebar, will use Tabs in Main Content
# sort_option = st.sidebar.radio("並び順 (Sort Order)", ["ダンサー名順 (Dancer)", "種目順 (Discipline)"], index=0)


# Edit Mode Toggle
st.sidebar.markdown("---")
edit_mode = st.sidebar.toggle("🔧 編集モード (Edit Mode)", value=False)

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
    with st.form("edit_form"):
        e_dancer = st.text_input("ダンサー (Dancer)", value=row_data['ダンサー'])
        e_discipline = st.selectbox("種目 (Discipline)", ['W', 'T', 'F', 'Q', 'V', 'S', 'C', 'R', 'P', 'J', 'Other'], index=['W', 'T', 'F', 'Q', 'V', 'S', 'C', 'R', 'P', 'J', 'Other'].index(row_data['種目']) if row_data['種目'] in ['W', 'T', 'F', 'Q', 'V', 'S', 'C', 'R', 'P', 'J', 'Other'] else 10)
        e_img_url = st.text_input("画像URL (Image URL)", value=row_data['画像URL'])
        e_video_url = st.text_input("動画URL (Video URL)", value=row_data['動画URL'])
        e_memo = st.text_area("メモ (Memo)", value=row_data['メモ'])
        
        if st.form_submit_button("更新 (Update)"):
            # Update logic
            try:
                # Need to verify we are updating the correct row in the original DF
                # Use the 'index' passed, which should be the original index
                conn = st.connection("gsheets", type=GSheetsConnection)
                
                # Fetch fresh data to ensure we don't overwrite other unrelated changes if possible, 
                # but simplest is to modify our current cached df and push.
                # BETTER: Read fresh, update one row, push.
                curr_df = conn.read(spreadsheet=SPREADSHEET_URL)
                
                # Update the specific row
                curr_df.at[index, 'ダンサー'] = e_dancer
                curr_df.at[index, '種目'] = e_discipline
                curr_df.at[index, '画像URL'] = e_img_url
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
    if st.button("🏠 Home / Reset", use_container_width=True, on_click=clear_filters):
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
from st_keyup import st_keyup

with st.expander("➕ 新規動画登録 (Add New Video)"):
    st.markdown("**(1) ダンサー & 種目 (Dancer & Discipline)**")
    c1, c2 = st.columns([2, 1])
    
    with c1:
        # Initialize dynamic key counters if not present
        if "reg_dancer_key_ver" not in st.session_state: st.session_state["reg_dancer_key_ver"] = 0
        
        # Helper for updating state from pills
        def apply_dancer_suggestion():
            if st.session_state.get("reg_dancer_pills"):
                st.session_state["reg_dancer_value"] = st.session_state.reg_dancer_pills
                # Increment key version to force st_keyup to re-mount with new value
                st.session_state["reg_dancer_key_ver"] += 1

        # Use a dynamic key to force re-render when suggestion is picked
        current_dancer_key = f"reg_dancer_keyup_{st.session_state['reg_dancer_key_ver']}"
        
        # Get default
        default_dancer_val = st.session_state.get("reg_dancer_value", "")

        # Main Dancer Input (st_keyup for real-time)
        dancer_val = st_keyup("ダンサー名 (Dancer Name)", value=default_dancer_val, key=current_dancer_key, placeholder="例: Riccardo & Yulia (Type for suggestions)")
        
        # Suggestions Logic (Real-time)
        matches = []
        if dancer_val:
            matches = [d for d in all_dancers if dancer_val.lower() in d.lower()]
            matches = [m for m in matches if m != dancer_val]
        
        if matches:
            st.pills("候補", matches, selection_mode="single", key="reg_dancer_pills", on_change=apply_dancer_suggestion, label_visibility="collapsed")

    with c2:
        new_discipline = st.selectbox("種目 (Discipline)", ['W', 'T', 'F', 'Q', 'V', 'S', 'C', 'R', 'P', 'J', 'Other'])

    st.markdown("**(2) メディア & メモ (Media & Memo)**")
    c3, c4 = st.columns(2)
    with c3:
        new_img_url = st.text_input("画像URL (Image URL)", placeholder="空欄でYouTubeから自動取得", help="Leave empty to auto-generate")
    with c4:
        new_video_url = st.text_input("動画URL (Video URL)", placeholder="https://youtu.be/...")
    
    # Memo with suggestions
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
    
    new_memo = st_keyup("メモ (Memo)", value=default_memo_val, key=current_memo_key, placeholder="Keywords, notes...")
    
    memo_matches = []
    if new_memo:
        tokens = new_memo.split()
        if tokens:
            last_token = tokens[-1]
            memo_matches = [w for w in sorted_vocab if last_token.lower() in w.lower() and last_token != w]
    
    if memo_matches:
         st.pills("タグ候補", memo_matches, selection_mode="single", key="reg_memo_pills", on_change=apply_memo_suggestion, label_visibility="collapsed")
    
    if st.button("登録 (Register)", type="primary"):
        # Validation and Submission
        final_dancer = dancer_val
        if not final_dancer:
             st.error("ダンサー名を入力してください。")
        elif not new_video_url:
            st.error("動画URLは必須です。")
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
                st.success(f"登録しました！: {final_dancer}")
                st.cache_data.clear()
                # Clear inputs
                if "reg_dancer_keyup" in st.session_state: del st.session_state.reg_dancer_keyup
                if "reg_memo_keyup" in st.session_state: del st.session_state.reg_memo_keyup
                if "reg_dancer_pills" in st.session_state: del st.session_state.reg_dancer_pills
                st.rerun()
            except Exception as e:
                st.error(f"書き込みエラー: {e}")

st.markdown(f"Showing {len(filtered_df)} videos")

# Grid Layout (3 columns)
# -----------------------------------------------------------------------------
# Grid Renderer Function
# -----------------------------------------------------------------------------
def render_video_grid(df_subset):
    if df_subset.empty:
        st.write("No videos found.")
        return

    cols = st.columns(3)
    for idx, row in enumerate(df_subset.itertuples()):
        col = cols[idx % 3]
        original_idx = row.Index
        
        dancer = row.ダンサー
        discipline = row.種目
        img_url = row.画像URL
        video_url = row.動画URL
        
        # Robust access to Memo
        # Handle cases where 'メモ' might not be in the namedtuple if column renaming failed or special characters issues
        # Or simply ensure it's a clean string
        try:
            raw_memo = getattr(row, 'メモ', "")
        except AttributeError:
            raw_memo = ""
            
        memo = str(raw_memo) if raw_memo is not None else ""
        if memo.lower() == "nan": 
            memo = ""
        
        # Prepare memo HTML block conditionally (Flattened HTML)
        memo_html = ""
        if memo.strip():
            memo_html = f'<div style="font-size:0.8rem; color:#aaa; margin-bottom:4px; line-height:1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{memo}</div>'
        
        with col:
            # Flattened Card HTML to prevent Markdown code block issues
            card_html = f"""<a href="{video_url}" target="_blank" class="card-link"><div class="dance-card"><div style="width:100%; height:200px; overflow:hidden; position:relative;"><img src="{img_url}" alt="{dancer}" onerror="this.onerror=null; this.src='https://via.placeholder.com/320x180.png?text=No+Image'" style="width:100%; height:100%; object-fit:cover;"></div><div class="dance-card-content">{memo_html}<div class="dance-title">{dancer}</div><div class="dance-meta"><span>{discipline}</span><span class="badge" style="font-size:0.75rem; background:#CC0000; color=white;">YouTube</span></div></div></div></a>"""
            
            st.markdown(card_html, unsafe_allow_html=True)
            
            # Show buttons only if Edit Mode is ON
            if edit_mode:
                b_col1, b_col2 = st.columns(2)
                with b_col1:
                    if st.button("✏️ 編集", key=f"edit_{original_idx}"):
                        edit_video_dialog(original_idx, row._asdict())
                with b_col2:
                    if st.button("🗑️ 削除", key=f"del_{original_idx}"):
                        delete_video_dialog(original_idx, f"{dancer} - {discipline}")

# -----------------------------------------------------------------------------
# Layout Logic based on Sort Mode
# -----------------------------------------------------------------------------
# -----------------------------------------------------------------------------
# Layout Logic based on Tabs
# -----------------------------------------------------------------------------
tab_dancer, tab_discipline = st.tabs(["ダンサー順 (By Dancer)", "種目順 (By Discipline)"])

with tab_dancer:
    # Sort by Dancer Name
    df_dancer_sorted = filtered_df.sort_values(by=['ダンサー', 'sort_rank'])
    render_video_grid(df_dancer_sorted)

with tab_discipline:
    # Sort by rank(Discipline), then by Dancer (for the underlying data if needed, but we split by header)
    
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
    # st.markdown("Jump to: " + " | ".join(links))
    
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

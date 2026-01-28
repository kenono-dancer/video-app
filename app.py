import streamlit as st
import traceback

st.title("Debug Mode")

try:
    st.write("Streamlit imported")
    import pandas as pd
    st.write(f"Pandas version: {pd.__version__}")
    
    from streamlit_gsheets import GSheetsConnection
    st.write("GSheetsConnection imported")
    
    import ssl
    import pykakasi
    st.write(f"Pykakasi imported: {pykakasi.__version__}")
    
    from googleapiclient.discovery import build
    st.write("Google API Client imported")
    
    st.success("All imports successful!")
except Exception as e:
    st.error("Import Error")
    st.code(traceback.format_exc())

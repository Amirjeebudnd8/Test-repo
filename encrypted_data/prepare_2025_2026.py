import os
import zipfile
import pandas as pd
import requests
import time
from datetime import datetime

SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"]
INTERVAL = "5m"
BASE_URL = "https://data.binance.vision/data/spot/monthly/klines"
ZIPS_DIR = "zips"
OUTPUT_BASE = "data"
COMBINED_DIR = os.path.join(OUTPUT_BASE, "All_Coins_Combined")
TIMEFRAME = "5m"

def days_in_month(year, month):
    if month == 2:
        return 29 if (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0) else 28
    return 30 if month in [4, 6, 9, 11] else 31

# ---------- دقیقاً همان تابع ts_to_datetime در prepare_data.py خودتان ----------
def ts_to_datetime(ts):
    try:
        if pd.isna(ts):
            return pd.NaT
        num = int(float(ts))
        s = str(num)
        l = len(s)
        if l >= 19:          # نانوثانیه
            seconds = num // 1_000_000_000
        elif l == 16:        # میکروثانیه
            seconds = num // 1_000_000
        elif l == 13:        # میلی‌ثانیه
            seconds = num // 1_000
        else:                # ثانیه یا کمتر
            seconds = num
        return pd.to_datetime(seconds, unit='s', utc=True)
    except:
        return pd.NaT

def read_csv_from_zip(zip_path):
    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            csv_files = [f for f in zf.namelist() if f.endswith('.csv') and not f.startswith('__')]
            if not csv_files:
                return None
            with zf.open(csv_files[0]) as f:
                df = pd.read_csv(f, header=None, usecols=range(6),
                                 names=['timestamp', 'open', 'high', 'low', 'close', 'volume'],
                                 on_bad_lines='skip')
        if df.empty:
            return None
        df['timestamp'] = pd.to_numeric(df['timestamp'], errors='coerce')
        df = df.dropna(subset=['timestamp'])
        df['_time'] = df['timestamp'].apply(ts_to_datetime)
        df = df.dropna(subset=['_time'])
        df = df.sort_values('_time').reset_index(drop=True)
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        df['volume'] = df['volume'].fillna(0.0)
        return df[['_time', 'open', 'high', 'low', 'close', 'volume']].rename(columns={'_time': 'timestamp'})
    except Exception as e:
        print(f"❌ خطا در خواندن {zip_path}: {e}")
        return None

def get_filename(coin, year, month, part):
    dim = days_in_month(year, month)
    if part == 1:
        s, e = f'{year}-{month:02d}-01', f'{year}-{month:02d}-10'
    elif part == 2:
        s, e = f'{year}-{month:02d}-11', f'{year}-{month:02d}-20'
    else:
        s, e = f'{year}-{month:02d}-21', f'{year}-{month:02d}-{dim}'
    return f"{coin}-{TIMEFRAME}-{s}_{e}.csv"

def process_zip(zip_path, coin):
    df = read_csv_from_zip(zip_path)
    if df is None or df.empty:
        return 0
    df['year'] = df['timestamp'].dt.year
    df['month'] = df['timestamp'].dt.month
    df['day'] = df['timestamp'].dt.day
    # فقط ۲۰۲۵ و ۲۰۲۶
    df = df[df['year'].isin([2025, 2026])]
    if df.empty:
        return 0
    cnt = 0
    for (y, m), grp in df.groupby(['year', 'month']):
        part1 = grp[grp['day'] <= 10]
        part2 = grp[(grp['day'] >= 11) & (grp['day'] <= 20)]
        part3 = grp[grp['day'] >= 21]
        for pn, pdf in [(1, part1), (2, part2), (3, part3)]:
            if pdf.empty:
                continue
            fname = get_filename(coin, y, m, pn)
            pdf.to_csv(os.path.join(COMBINED_DIR, fname), index=False)
            coin_dir = os.path.join(OUTPUT_BASE, coin)
            os.makedirs(coin_dir, exist_ok=True)
            pdf.to_csv(os.path.join(coin_dir, fname), index=False)
            cnt += 1
    return cnt

def download_zips_2025_2026():
    os.makedirs(ZIPS_DIR, exist_ok=True)
    total = 0
    cur_month = datetime.now().month
    for symbol in SYMBOLS:
        for year in [2025, 2026]:
            for month in range(1, 13):
                if year == 2026 and month > cur_month:
                    break
                filename = f"{symbol}-{INTERVAL}-{year}-{month:02d}.zip"
                url = f"{BASE_URL}/{symbol}/{INTERVAL}/{filename}"
                local_path = os.path.join(ZIPS_DIR, filename)

                if os.path.exists(local_path):
                    total += 1
                    continue

                try:
                    resp = requests.get(url, stream=True, timeout=30)
                    if resp.status_code == 404:
                        continue
                    resp.raise_for_status()
                    with open(local_path, 'wb') as f:
                        for chunk in resp.iter_content(8192):
                            f.write(chunk)
                    total += 1
                except:
                    pass
                time.sleep(0.5)
    print(f"🎯 کل فایل‌های ZIP دریافت‌شده: {total}")

def main():
    os.makedirs(COMBINED_DIR, exist_ok=True)

    if not os.path.isdir(ZIPS_DIR) or not any(f.endswith('.zip') for f in os.listdir(ZIPS_DIR)):
        download_zips_2025_2026()

    for z in os.listdir(ZIPS_DIR):
        if z.endswith('.zip') and ('2025' in z or '2026' in z):
            coin = z.split('-')[0]
            print(f"📦 پردازش {z} ...")
            added = process_zip(os.path.join(ZIPS_DIR, z), coin)
            if added:
                print(f"   ✅ {added} فایل CSV جدید")

    print(f"🎯 کل فایل‌های CSV در All_Coins_Combined: {len(os.listdir(COMBINED_DIR))}")

if __name__ == "__main__":
    main()

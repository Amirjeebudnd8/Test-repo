import os
import zipfile
import pandas as pd
import requests
import time
from datetime import datetime

# ========== تنظیمات ==========
SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"]
INTERVAL = "5m"
START_YEAR = 2018
END_YEAR = datetime.now().year
CURRENT_MONTH = datetime.now().month
BASE_URL = "https://data.binance.vision/data/spot/monthly/klines"

ZIPS_DIR = "zips"
OUTPUT_BASE = "data"
COMBINED_DIR = os.path.join(OUTPUT_BASE, "All_Coins_Combined")
TIMEFRAME = "5m"

def days_in_month(year, month):
    if month == 2:
        return 29 if (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0) else 28
    return 30 if month in [4, 6, 9, 11] else 31

def ts_to_datetime(ts):
    try:
        if pd.isna(ts):
            return pd.NaT
        num = int(float(ts))
        return pd.to_datetime(num, unit='ms', utc=True)
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

def process_zip(zip_path, coin, year_filter):
    df = read_csv_from_zip(zip_path)
    if df is None or df.empty:
        return 0
    df['year'] = df['timestamp'].dt.year
    df['month'] = df['timestamp'].dt.month
    df['day'] = df['timestamp'].dt.day
    df = df[df['year'].apply(year_filter)]
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

def download_zips():
    os.makedirs(ZIPS_DIR, exist_ok=True)
    total = 0
    for symbol in SYMBOLS:
        print(f"\n📁 نماد: {symbol}")
        for year in range(START_YEAR, END_YEAR + 1):
            for month in range(1, 13):
                if year == END_YEAR and month > CURRENT_MONTH:
                    break
                filename = f"{symbol}-{INTERVAL}-{year}-{month:02d}.zip"
                url = f"{BASE_URL}/{symbol}/{INTERVAL}/{filename}"
                local_path = os.path.join(ZIPS_DIR, filename)

                if os.path.exists(local_path):
                    print(f"⏩ از قبل موجود: {filename}")
                    total += 1
                    continue

                try:
                    response = requests.get(url, stream=True, timeout=30)
                    if response.status_code == 404:
                        print(f"⚠️ وجود ندارد (404): {filename}")
                        continue
                    response.raise_for_status()
                    with open(local_path, 'wb') as f:
                        for chunk in response.iter_content(8192):
                            f.write(chunk)
                    print(f"✅ دانلود شد: {filename}")
                    total += 1
                except Exception as e:
                    print(f"❌ خطا در دانلود {filename}: {e}")
                time.sleep(0.5)
    print(f"\n🎯 دانلود کامل شد. تعداد کل فایل‌های ZIP دریافت شده: {total}")

def main():
    # ⚠️ شرط زیر را حذف کردیم
    # if os.path.exists(COMBINED_DIR) and os.listdir(COMBINED_DIR):
    #     print("✅ داده‌ها از قبل موجودند. نیاز به پردازش نیست.")
    #     return

    os.makedirs(COMBINED_DIR, exist_ok=True)

    if not os.path.isdir(ZIPS_DIR) or not any(f.endswith('.zip') for f in os.listdir(ZIPS_DIR)):
        print("⬇️  فایل‌های ZIP یافت نشد. در حال دانلود...")
        download_zips()

    all_zips = [f for f in os.listdir(ZIPS_DIR) if f.endswith('.zip')]
    if not all_zips:
        print("❌ هیچ فایل ZIP وجود ندارد.")
        return

    old = [z for z in all_zips if '2025' not in z and '2026' not in z]
    for z in old:
        process_zip(os.path.join(ZIPS_DIR, z), z.split('-')[0], lambda y: y < 2025)

    new = [z for z in all_zips if '2025' in z or '2026' in z]
    for z in new:
        process_zip(os.path.join(ZIPS_DIR, z), z.split('-')[0], lambda y: y >= 2025)

    print(f"🎯 کل فایل‌های CSV: {len(os.listdir(COMBINED_DIR))}")

if __name__ == "__main__":
    main()

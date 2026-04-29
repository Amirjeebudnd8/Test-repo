import os
import zipfile
import pandas as pd
import requests
import sys
from datetime import datetime

# ========== تنظیمات ==========
ZIPS_DIR = "zips"
OUTPUT_BASE = "data"
COMBINED_DIR = os.path.join(OUTPUT_BASE, "All_Coins_Combined")
TIMEFRAME = "5m"

# ========== بخش ۱: توابع تبدیل تاریخ و خواندن ==========
def days_in_month(year, month):
    if month == 2:
        return 29 if (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0) else 28
    return 30 if month in [4, 6, 9, 11] else 31

def ts_to_datetime(ts):
    try:
        if pd.isna(ts):
            return pd.NaT
        num = int(float(ts))
        s = str(num)
        if len(s) >= 19:
            seconds = num // 1_000_000_000
        elif len(s) == 16:
            seconds = num // 1_000_000
        elif len(s) == 13:
            seconds = num // 1_000
        else:
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
        df.dropna(subset=['timestamp'], inplace=True)
        df['_time'] = df['timestamp'].apply(ts_to_datetime)
        df.dropna(subset=['_time'], inplace=True)
        df.sort_values('_time', inplace=True)
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        df['volume'].fillna(0.0, inplace=True)
        return df[['_time', 'open', 'high', 'low', 'close', 'volume']].rename(columns={'_time': 'timestamp'})
    except Exception as e:
        print(f"❌ خطا در خواندن {zip_path}: {e}")
        return None

def get_filename(coin, year, month, part):
    dim = days_in_month(year, month)
    if part == 1:
        start = datetime(year, month, 1).strftime('%Y-%m-%d')
        end = datetime(year, month, 10).strftime('%Y-%m-%d')
    elif part == 2:
        start = datetime(year, month, 11).strftime('%Y-%m-%d')
        end = datetime(year, month, 20).strftime('%Y-%m-%d')
    else:
        start = datetime(year, month, 21).strftime('%Y-%m-%d')
        end = datetime(year, month, dim).strftime('%Y-%m-%d')
    return f"{coin}-{TIMEFRAME}-{start}_{end}.csv"

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
            # ذخیره در پوشه همه ارزها
            pdf.to_csv(os.path.join(COMBINED_DIR, fname), index=False)
            # ذخیره در پوشه اختصاصی ارز
            coin_dir = os.path.join(OUTPUT_BASE, coin)
            os.makedirs(coin_dir, exist_ok=True)
            pdf.to_csv(os.path.join(coin_dir, fname), index=False)
            cnt += 1
    return cnt

# ========== بخش ۲: تابع دانلود (جایگزین download_zips.py) ==========
def download_zips():
    """
    دانلود فایل‌های ZIP از یک منبع مشخص.
    این تابع جایگزین فایل download_zips.py است.
    """
    # لیست فایل‌های ZIP برای دانلود
    # می‌توانید URLها را اینجا اضافه کنید یا از یک فایل متنی بخوانید
    ZIP_URLS = [
        # مثال: "https://example.com/data/BTCUSDT-2020-01.zip",
    ]
    
    if not ZIP_URLS:
        print("❌ لیست فایل‌های ZIP برای دانلود خالی است.")
        print("   لطفاً ZIP_URLS را در prepare_data.py تنظیم کنید.")
        sys.exit(1)
    
    os.makedirs(ZIPS_DIR, exist_ok=True)
    for url in ZIP_URLS:
        filename = url.split('/')[-1]
        dest = os.path.join(ZIPS_DIR, filename)
        if os.path.exists(dest):
            print(f"✓ {filename} از قبل موجود است.")
            continue
        print(f"⬇️  دانلود {filename} ...")
        try:
            resp = requests.get(url, stream=True, timeout=300)
            resp.raise_for_status()
            with open(dest, 'wb') as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            print(f"✓ {filename} دانلود شد.")
        except Exception as e:
            print(f"❌ خطا در دانلود {filename}: {e}")

# ========== بخش ۳: تابع اصلی ==========
def main():
    # اگر داده‌ها از قبل آماده هستن، هیچ کاری نکن
    if os.path.exists(COMBINED_DIR) and os.listdir(COMBINED_DIR):
        print("✅ داده‌ها از قبل موجودند. نیاز به پردازش نیست.")
        return

    os.makedirs(COMBINED_DIR, exist_ok=True)

    # اگر فایل‌های ZIP وجود ندارن، دانلود کن
    if not os.path.isdir(ZIPS_DIR) or not any(f.endswith('.zip') for f in os.listdir(ZIPS_DIR)):
        print("⬇️  فایل‌های ZIP یافت نشد. در حال دانلود...")
        download_zips()

    if not os.path.isdir(ZIPS_DIR):
        print("❌ پوشه zips حتی بعد از دانلود هم موجود نیست.")
        return

    all_zips = [f for f in os.listdir(ZIPS_DIR) if f.endswith('.zip')]
    if not all_zips:
        print("❌ هیچ فایل ZIP در پوشه نیست.")
        return

    # پردازش بخش قدیمی (< 2025)
    old = [z for z in all_zips if '2025' not in z and '2026' not in z]
    print(f"📦 پردازش {len(old)} زیپ قدیمی...")
    for z in old:
        coin = z.split('-')[0]
        process_zip(os.path.join(ZIPS_DIR, z), coin, lambda y: y < 2025)

    # پردازش بخش جدید (2025/2026)
    new = [z for z in all_zips if '2025' in z or '2026' in z]
    print(f"📦 پردازش {len(new)} زیپ جدید...")
    for z in new:
        coin = z.split('-')[0]
        process_zip(os.path.join(ZIPS_DIR, z), coin, lambda y: y >= 2025)

    total = len(os.listdir(COMBINED_DIR))
    print(f"🎯 کل فایل‌های CSV تولید شده: {total}")

if __name__ == "__main__":
    main()

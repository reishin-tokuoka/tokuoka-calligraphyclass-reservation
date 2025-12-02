// ====================================
// 1. グローバル変数と定数
// ====================================

// 既存のグローバル変数
let mode = "default";
const APP_VERSION = "VERSION_002"; // キャッシュ無効化用
let userId = "INIT_USER_ID";
let displayName = "INIT_USER_NAME";
let userClassName = "";
let userUpperLimitNumber = 0;
const GAS_BASE_URL = "https://script.google.com/macros/s/AKfycbzyr19cHSDB7YJZhrmBFrGq-oRYK-A-NyXms_FLD1PnK8WMy53Jz03bwAQ9WIhFszYt/exec";

// 予約一覧画面用
let RESERVATION_DATA = []; // 予約データを格納
let currentCalendarDate = new Date(); // カレンダーの表示月を管理
const TODAY_STRING = new Date().toISOString().split('T')[0];
const MAX_RESERVABLE_MONTHS = 2; // (今月、来月)

const TODAY = new Date();
const TODAY_DATE_ONLY = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

// DOM要素
const calendarGrid = document.getElementById('calendar-grid');
const currentMonthSpan = document.getElementById('current-month');
const reservationList = document.getElementById('reservation-list');
const emptyListMessage = document.getElementById('empty-list-message');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');

// カスタムモーダル要素
const customModal = document.getElementById('custom-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
let currentConfirmCallback = null;

// ====================================
// 2. メイン処理と初期化
// ====================================

document.addEventListener("DOMContentLoaded", main);
async function main() {
    document.getElementById("main").classList.remove("hidden");

    const config = await loadConfig();
    console.log(config);
    
    try {
        await liff.init({ liffId: config.LIFF_ID });
        
        if (!liff.isLoggedIn()) {
            liff.login(); 
            return;
        }
        
        mode = getMode() || "default";
        await initUser(config);

        setupModalListeners();

    } catch (err) {
        console.error('LIFF init failed or subsequent process failed:', err);
        document.getElementById("errordisp").textContent = "初期化に失敗しました。LINEアプリの設定をご確認ください。";
    }
}

// ------------------------------
// GAS 設定をキャッシュ付きで取得
// ------------------------------
async function loadConfig() {
    const cacheKey = "configCacheV1" + APP_VERSION;
    const cache = localStorage.getItem(cacheKey);
    if (cache) {
      return JSON.parse(cache);
    }
    const res = await fetch(GAS_BASE_URL + "?mode=config");
    const json = await res.json();
    localStorage.setItem(cacheKey, JSON.stringify(json));
    return json;
}

// ------------------------------
// ユーザー情報取得（GASと通信）
// ------------------------------
async function initUser(config) {
    const accessToken = liff.getAccessToken();
    const userInfo = await fetchUserInfo(accessToken);
    console.log("GASからの返却値", userInfo);
    
    document.getElementById("loading").classList.add("hidden");

    if (userInfo.exists && userInfo.data) {
      const { userId: fetchedUserId, displayName: fetchedDisplayName, className, upperLimitNumber } = userInfo.data;
      userId = fetchedUserId;
      displayName = fetchedDisplayName;
      userClassName = className; 
      userUpperLimitNumber = upperLimitNumber;

      document.getElementById("user-select").classList.add("hidden");
      switchPage(mode, false);
      
    } else if (userInfo.data) {
      const { userId: fetchedUserId, displayName: fetchedDisplayName } = userInfo.data;
      userId = fetchedUserId;
      displayName = fetchedDisplayName;

      document.getElementById("user-select").classList.remove("hidden");
      setupClassSelect(config);
    } else {
      console.error("ユーザー情報の取得に失敗しました。", userInfo.message);
      document.getElementById("errordisp").textContent = "ユーザー情報取得エラー: " + userInfo.message;
    }
}

// -----------------------------
// ユーザ情報取得（GAS高速）
// -----------------------------
async function fetchUserInfo(accessToken) {
    const payload = { mode: "verifyAndGetUserInfo", accessToken: accessToken };
    const formBody = new URLSearchParams(payload);
    
    const res = await fetch(GAS_BASE_URL, {
        method: "POST", 
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, 
        body: formBody
    });
    return await res.json();
}

// -----------------------------
// 授業選択画面の表示処理 (既存ロジックのため省略)
// -----------------------------
function setupClassSelect(config) {
  const classSelect = document.getElementById("classSelect");
  const countSelect = document.getElementById("countSelect");
  const submitBtn = document.getElementById("classSubmitBtn");

  const classNames = config.CLASS_INFO.CLASS_NAME;
  classSelect.innerHTML = `<option value="">選択してください</option>`;
  classNames.forEach((name, index) => {
    classSelect.innerHTML += `<option value="${index}">${name}</option>`;
  });

  classSelect.addEventListener("change", () => {
    const idx = classSelect.value;

    if (idx === "") {
      countSelect.disabled = true;
      submitBtn.classList.add("hidden");
      countSelect.innerHTML = `
        <option value="">クラスを先に選んでください</option>`;
      return;
    }

    const upperArray = config.CLASS_INFO.UPPER_LIMIT_NUMBER;
    countSelect.disabled = false;
    countSelect.innerHTML = `<option value="">選択してください</option>`;
    upperArray.forEach(n => {
      countSelect.innerHTML += `<option value="${n}">${n}回</option>`;
    })

    submitBtn.classList.add("hidden");
  });

  countSelect.addEventListener("change", () => {
    if (countSelect.value !== "") {
      submitBtn.classList.remove("hidden");
    } else {
      submitBtn.classList.add("hidden");
    }
  });

  submitBtn.addEventListener("click", () => {
    const selectedClassIndex = classSelect.value;
    const selectedUpperLimitNumber = countSelect.value;
    registerUserClass(selectedClassIndex, selectedUpperLimitNumber, config);
  });

}
async function registerUserClass(classIndex, upperLimitNumber, config) {
  const className = config.CLASS_INFO.CLASS_NAME[classIndex];

  // 送信データをオブジェクトでまとめる
  const payload = {
    mode: "registerUserInfo",
    userId: userId,
    displayName: displayName,
    className: className,
    upperLimitNumber: upperLimitNumber
  };
  console.log("registerUserInfo payload", payload);
  
  const formBody = new URLSearchParams(payload);
  try {
    const res = await fetch(GAS_BASE_URL, { 
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody
    });

    const json = await res.json();
    console.log(json);

    let messageText = "";
    if (json.success) {
      messageText = "クラスの登録が完了しました！";
      sendResigterResultMessage(messageText);
      switchPage(mode, true);
    } else {
      messageText = "クラスの登録に失敗しました！";
      sendResigterResultMessage(messageText);
    }
  } catch (e) {
    alert("通信エラーが発生しました");
    console.log(e);
  }
}
function sendResigterResultMessage(messageText) {
  // 1. LIFFが初期化されているか、かつLINEアプリ内で動作しているかを確認
  if (!liff.isInClient()) {
      alert("メッセージ送信はLINEアプリ内でのみ実行可能です。");
      return;
  }
  // 2. メッセージを送信
  liff.sendMessages([{ type: 'text', text: messageText }])
      .then(() => {
          console.log('Message sent successfully!');
      })
      .catch((err) => {
          console.error('Error sending message:', err);
      });
}

// ------------------------------
// URLパラメータ取得
// ------------------------------
function getMode() {
  if (window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.has("mode")) {
      return hashParams.get("mode");
    }
  }
}

// ------------------------------
// 画面切り替え
// ------------------------------
async function switchPage(mode, registerFlag) {
  const reservation = document.getElementById("reservationArea");
  const list = document.getElementById("listArea");
  const userSelect = document.getElementById("user-select");

  if (registerFlag) {
      userSelect.classList.add("hidden");
  }

  if (mode === "list") {
      reservation.classList.add("hidden");
      list.classList.remove("hidden");
      // ★ 予約一覧画面の描画を開始
      await renderReservationListScreen(); 
  } else {
      list.classList.add("hidden");
      reservation.classList.remove("hidden");
  }
}

// ====================================
// 3. 予約一覧画面 ロジック
// ====================================

// ------------------------------
// ユーザーの予約情報を取得（GASと通信）
// ------------------------------
async function fetchReservations() {
    const payload = { mode: "getReservations", userId: userId };
    const formBody = new URLSearchParams(payload);
    
    try {
        const res = await fetch(GAS_BASE_URL, {
            method: "POST", 
            headers: { "Content-Type": "application/x-www-form-urlencoded" }, 
            body: formBody
        });
        
        const json = await res.json();
        
        if (json.success && json.reservations) {
            RESERVATION_DATA = json.reservations;
        } else {
            console.error("予約情報の取得に失敗しました", json.message);
            RESERVATION_DATA = [];
        }
    } catch (e) {
        console.error("予約情報取得時の通信エラー", e);
        RESERVATION_DATA = [];
    }
}

// ------------------------------
// 予約一覧画面の描画メイン関数
// ------------------------------
async function renderReservationListScreen() {
    await fetchReservations();

    // 月が予約可能範囲外でないかチェックし、範囲外であれば今月へリセット
    if (!isMonthInAllowedRange(currentCalendarDate)) {
        currentCalendarDate = new Date();
    }

    renderCalendar(currentCalendarDate);
    renderReservationList();
    
    // イベントリスナー設定（二重登録防止チェックあり）
    if (!prevMonthBtn.hasAttribute('data-listener')) {
        prevMonthBtn.addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            renderCalendar(currentCalendarDate);
            renderReservationList();
        });
        nextMonthBtn.addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            renderCalendar(currentCalendarDate);
            renderReservationList();
        });
        prevMonthBtn.setAttribute('data-listener', 'true');
    }
}

// ------------------------------
// カレンダー描画ロジック
// ------------------------------
function renderCalendar(date) {
    const today = new Date();
    const year = date.getFullYear();
    const month = date.getMonth(); 
    
    currentMonthSpan.textContent = `${year}年 ${month + 1}月`;
    calendarGrid.innerHTML = ''; 

    const daysOfWeek = ['日', '月', '火', '水', '木', '金', '土'];
    daysOfWeek.forEach(day => { calendarGrid.innerHTML += `<div class="day-header">${day}</div>`; });

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDayOfMonth.getDay(); 

    for (let i = 0; i < startDayOfWeek; i++) { calendarGrid.innerHTML += '<div></div>'; }

    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const isPastDay = new Date(dateString) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

        const isReserved = RESERVATION_DATA.some(res =>
            res.status !== 'キャンセル済み' &&
            new Date(res.date).toISOString().startsWith(dateString));
        const isToday = dateString === TODAY_STRING;
        
        let classList = '';
        if (isReserved) classList += 'reserved-day';
        if (isToday) classList += (isReserved ? ' ' : '') + 'today';
        if (isPastDay) classList += (classList ? ' ' : '') + 'past-day';

        calendarGrid.innerHTML += `
            <div class="date-cell">
                <span class="${classList}" data-date="${dateString}">${day}</span>
            </div>`;
    }

    const currentMonthOnly = new Date(year, month, 1);
    const nextMonthOnly = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    // 前月ボタン: 今月が表示されている場合は非表示
    if (currentMonthOnly.getTime() <= new Date(today.getFullYear(), today.getMonth(), 1).getTime()) {
        prevMonthBtn.style.visibility = 'hidden';
    } else {
        prevMonthBtn.style.visibility = 'visible';
    }

    // 次月ボタン: 予約可能範囲の最終月（来月）が表示されている場合は非表示
    if (currentMonthOnly.getTime() >= nextMonthOnly.getTime()) {
        nextMonthBtn.style.visibility = 'hidden';
    } else {
        nextMonthBtn.style.visibility = 'visible';
    }
}

// ------------------------------
// 予約リスト描画ロジック
// ------------------------------
function renderReservationList() {
    reservationList.innerHTML = ''; 

    // 現在カレンダーに表示されている月 (年と月のみ)
    const currentYear = currentCalendarDate.getFullYear();
    const currentMonth = currentCalendarDate.getMonth();

    const futureActiveReservations = RESERVATION_DATA
        .map(res => {
            // 受講済みステータスとグレーアウトフラグを付与する（前回の修正ロジック）
            const resDate = new Date(res.date);
            const resDateOnly = new Date(resDate.getFullYear(), resDate.getMonth(), resDate.getDate());

            const processedRes = { 
                ...res, 
                displayStatus: res.status, 
                isInactive: false
            };

            // 過去の予約を「受講済み」にする
            if (resDateOnly < TODAY_DATE_ONLY && res.status !== 'キャンセル済み') {
                processedRes.displayStatus = '受講済み';
                processedRes.isInactive = true;
            } 
            if (res.status === 'キャンセル済み') {
                processedRes.isInactive = true;
            }
            return processedRes;
        })
        // ★ 絞り込み 1: 表示されているカレンダーの月に属する予約のみに絞り込む
        .filter(res => {
            const resDate = new Date(res.date);
            return resDate.getFullYear() === currentYear && resDate.getMonth() === currentMonth;
        })
        // ★ 絞り込み 2: キャンセル済みのものはリストに表示しない (displayStatusではなく元のstatusで判断)
        .filter(res => res.status !== 'キャンセル済み') 
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (futureActiveReservations.length === 0) {
        emptyListMessage.classList.remove('hidden');
        return;
    } 
    
    emptyListMessage.classList.add('hidden');
    
    futureActiveReservations.forEach(res => {
        reservationList.appendChild(createReservationItem(res));
    });
}

// ------------------------------
// 予約アイテムのHTML生成
// ------------------------------
function createReservationItem(reservation) {
    const { id, date, duration, className, cancellableUntil, isInactive, displayStatus } = reservation;
    
    const lessonStart = new Date(date);
    const lessonEnd = new Date(lessonStart.getTime() + duration * 60000); 
    
    const now = new Date();
    const limit = new Date(cancellableUntil);
    const isCancellable = !isInactive && now < limit && reservation.status === '確定';
    
    const formattedTime = `${lessonStart.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })} ${lessonStart.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}〜${lessonEnd.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
    const formattedLimit = limit.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) + limit.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    const item = document.createElement('div');
    item.className = 'reservation-item';
    if (isInactive) item.classList.add('reservation-item--inactive');
    
// キャンセル期限の表示テキストを調整
    let cancelAreaContent = '';
    if (isCancellable) {
        cancelAreaContent = `
            <button class="cancel-button" data-id="${id}">[キャンセル]</button>
            <span class="cancel-limit">${formattedLimit}まで</span>
        `;
    } else {
        // ★ 変更: displayStatusを使用
        cancelAreaContent = `<span class="cancel-limit">${displayStatus}</span>`;
    }

    item.innerHTML = `
        <div class="item-details">
            <div class="date-time">${formattedTime}</div>
            <div class="lesson-name">${className}</div>
        </div>
        <div class="cancel-area">
            ${cancelAreaContent}
        </div>
    `;
    
    if (isCancellable) {
        item.querySelector('.cancel-button').addEventListener('click', () => handleCancel(id));
    }

    return item;
}

// ------------------------------
// キャンセル処理（カスタムモーダル）
// ------------------------------
const handleCancel = (id) => {
    showCustomModal(
        '予約のキャンセル',
        '本当にこの予約をキャンセルしますか？この操作は元に戻せません。',
        async () => {
            await executeCancellation(id);
        }
    );
};

// ------------------------------
// GASへのキャンセルAPIコール
// ------------------------------
async function executeCancellation(reservationId) {
    const payload = { mode: "cancelReservation", userId: userId, reservationId: reservationId };
    const formBody = new URLSearchParams(payload);

    try {
        const res = await fetch(GAS_BASE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody });
        const json = await res.json();
        
        if (json.success) {
            alert("キャンセルが完了しました。");
            await renderReservationListScreen();
        } else {
            alert("キャンセルに失敗しました: " + json.message);
        }
    } catch (e) {
        alert("通信エラーが発生しました");
        console.error("キャンセル通信エラー:", e);
    }
}

// ------------------------------
// カスタムモーダル表示ロジック
// ------------------------------
const showCustomModal = (title, message, onConfirm) => {
    modalTitle.textContent = title;
    modalMessage.textContent = message;

    currentConfirmCallback = onConfirm; 
    customModal.classList.remove('hidden');
};

const hideCustomModal = () => {
    customModal.classList.add('hidden');
    currentConfirmCallback = null;
};

// ====================================
// 4. カスタムモーダル イベントリスナー設定
// ====================================
function setupModalListeners() {
    // 承認ボタンの処理
    modalConfirmBtn.addEventListener('click', async () => {
        customModal.classList.add('hidden');
        if (currentConfirmCallback) {
            try {
                await currentConfirmCallback();
            } catch (error) {
                console.error("Confirm callback failed:", error);
            }
        }
        currentConfirmCallback = null;
    });

    // キャンセルボタンの処理
    modalCancelBtn.addEventListener('click', () => {
        hideCustomModal(true);
    });
}

// ------------------------------
// カレンダー表示月が許容範囲内か判定
// ------------------------------
function isMonthInAllowedRange(date) {
    const today = new Date();
    // 比較のために日時をリセット (年と月のみで比較)
    const currentMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // 予約可能な最終月（来月）
    const endMonth = new Date(today.getFullYear(), today.getMonth() + MAX_RESERVABLE_MONTHS - 1, 1);

    // 今月以降、かつ予約可能な最終月以前であるか
    return currentMonth >= startMonth && currentMonth <= endMonth;
}
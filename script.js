// ====================================
// 1. グローバル変数と定数
// ====================================

// 既存のグローバル変数
let mode = "default";
const APP_VERSION = "VERSION_003"; // キャッシュ無効化用
let userId = "INIT_USER_ID";
let displayName = "INIT_USER_NAME";
let userClassName = "";
let userUpperLimitNumber = 0;
const GAS_BASE_URL = "https://script.google.com/macros/s/AKfycbxQPiNqa3uHpnkrCiwlLL1CvHxZojD9PNqaUjV_-viiGDvZzelNEB_D-sQ3oAsixS78/exec";

// 予約画面用
let AVAILABLE_CAPACITY_DATA = {}; // { 'YYYY-MM-DD': [{ startTime: 'HH:mm', className: '...', remainingCapacity: N }, ...] }
const CURRENT_SCREEN_DATE = new Date(); // 予約画面のカレンダー表示月 (currentCalendarDateとは別に、予約画面用として使用)

// 予約一覧画面用
let RESERVATION_DATA = []; // 予約データを格納
let currentCalendarDate = new Date(); // カレンダーの表示月を管理
const TODAY = new Date();
const TODAY_DATE_ONLY = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
const TODAY_STRING = [
    TODAY.getFullYear(),
    String(TODAY.getMonth() + 1).padStart(2, '0'),
    String(TODAY.getDate()).padStart(2, '0')
].join('-');
const MAX_RESERVABLE_MONTHS = 2; // (今月、来月)


// 現在選択されているフィルター日付 (YYYY-MM-DD 形式)
let monthFilterMap = {};


// DOM要素
const reservationArea = document.getElementById("reservationArea"); // ⭐ 追加
const listArea = document.getElementById("listArea"); // ⭐ 追加
const calendarGrid = document.getElementById('calendar-grid');
const currentMonthSpan = document.getElementById('current-month');
const reservationList = document.getElementById('reservation-list');
const emptyListMessage = document.getElementById('empty-list-message');
const prevMonthBtnList = document.getElementById('prev-month-btn');
const nextMonthBtnList = document.getElementById('next-month-btn');

// 予約画面用に追加定義するDOM要素 (IDは仮定)
const calendarContainerRes = document.getElementById('calendar-container-res'); // 予約画面のカレンダーグリッド本体
const currentMonthSpanRes = document.getElementById('current-month-res');       // 予約画面の月表示
const prevMonthBtnRes = document.getElementById('prev-month-btn-res');         // 予約画面の前月ボタン
const nextMonthBtnRes = document.getElementById('next-month-btn-res');         // 予約画面の次月ボタン

// 予約画面固有の要素
const selectionDetails = document.getElementById('selectionDetails'); 
const selectedDateText = document.getElementById('selectedDateText');
const availableClassesList = document.getElementById('availableClassesList');

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
    const res = await fetch("/config.json");

    // 取得失敗時のエラーハンドリング
    if (!res.ok) {
        console.error(`設定ファイルのロードに失敗しました: ${res.status} ${res.statusText}`);
        throw new Error("設定ファイルが見つからないか、アクセスできません。");
    }

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
  const reservation = reservationArea;
  const list = listArea
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
      // ★ 予約画面の描画を開始
      setupReservationScreen();
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
    // 月が予約可能範囲外でないかチェックし、範囲外であれば今月へリセット
    if (!isMonthInAllowedRange(currentCalendarDate)) {
        currentCalendarDate = new Date();
    }
    // 予約データを待たずに、カレンダー（UI）を先に描画する
    renderCalendar(currentCalendarDate);

    await fetchReservations();

    renderCalendar(currentCalendarDate);
    renderReservationList();
    
    // イベントリスナー設定（二重登録防止チェックあり）
    if (!prevMonthBtnList.hasAttribute('data-listener')) {
        prevMonthBtnList.addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            renderCalendar(currentCalendarDate);
            renderReservationList();
        });
        nextMonthBtnList.addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            renderCalendar(currentCalendarDate);
            renderReservationList();
        });
        prevMonthBtnList.setAttribute('data-listener', 'true');
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

    let calendarHtml = '';

    const daysOfWeek = ['日', '月', '火', '水', '木', '金', '土'];
    daysOfWeek.forEach(day => { calendarHtml += `<div class="day-header">${day}</div>`; });

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDayOfMonth.getDay(); 

    for (let i = 0; i < startDayOfWeek; i++) { calendarHtml += '<div></div>'; }

    // 予約リストを準備 (月の判定を効率化)
    // 予約データの日付を 'yyyy-MM-dd' 形式でセットに格納
    const reservedDates = new Set(RESERVATION_DATA
        .filter(res => res.status === '確定') // GASの関数は'確定'のみ返すので、一応確認
        .map(res => {
            // GASから返された 'dateTime' は 'yyyy/MM/dd HH:mm' 形式を想定
            // 日付部分 (yyyy/MM/dd) のみを取得
            const datePart = res.dateTime.split(' ')[0];
            // YYYY/MM/DD形式をYYYY-MM-DD形式に変換してSetに格納
            return datePart.replace(/\//g, '-');
        })
    );

    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const isPastDay = new Date(dateString) < TODAY_DATE_ONLY;
        const isReserved = reservedDates.has(dateString);
        const isToday = dateString === TODAY_STRING;
        
        let classList = '';
        if (isReserved) classList += 'reserved-day';
        if (isToday) classList += (isReserved ? ' ' : '') + 'today';
        if (isPastDay) classList += (classList ? ' ' : '') + 'past-day';

        calendarHtml += `
            <div class="date-cell">
                <span class="${classList}" data-date="${dateString}">${day}</span>
            </div>`;
    }

    // ループ終了後、DOMへの書き込みは一度だけ行う
    calendarGrid.innerHTML = calendarHtml;

    // リスナーを設定
    setupCalendarDateListeners(); 
    // 選択状態を視覚的に更新
    updateCalendarSelection();

    const currentMonthOnly = new Date(year, month, 1);
    const nextMonthOnly = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    // 前月ボタン: 今月が表示されている場合は非表示
    if (currentMonthOnly.getTime() <= new Date(today.getFullYear(), today.getMonth(), 1).getTime()) {
        prevMonthBtnList.style.visibility = 'hidden';
    } else {
        prevMonthBtnList.style.visibility = 'visible';
    }

    // 次月ボタン: 予約可能範囲の最終月（来月）が表示されている場合は非表示
    if (currentMonthOnly.getTime() >= nextMonthOnly.getTime()) {
        nextMonthBtnList.style.visibility = 'hidden';
    } else {
        nextMonthBtnList.style.visibility = 'visible';
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

    // ★ 修正: 月フィルターマップから現在の月のフィルター日付を取得
    const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const selectedFilterDate = monthFilterMap[currentMonthKey];

    const futureActiveReservations = RESERVATION_DATA
        .map(res => {
            const resDateTimeString = res.dateTime.replace(/\//g, '-');
            const resDateTimeObj = new Date(resDateTimeString);

            const resDateOnly = new Date(resDateTimeObj.getFullYear(), resDateTimeObj.getMonth(), resDateTimeObj.getDate());

            const processedRes = { 
                ...res, 
                dateObject: resDateTimeObj,
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
        // 表示されているカレンダーの月に属する予約のみに絞り込む
        .filter(res => {
            return res.dateObject.getFullYear() === currentYear && res.dateObject.getMonth() === currentMonth;
        })
        // 月のフィルター日付が設定されていれば適用
        .filter(res => {
            if (selectedFilterDate) { 
                // selectedFilterDate は YYYY-MM-DD 形式
                const resDateString = new Date(res.dateObject).toISOString().split('T')[0];
                return resDateString === selectedFilterDate;
            }
            return true; // フィルターがなければ全件表示
        })
        // キャンセル済みのものはリストに表示しない (displayStatusではなく元のstatusで判断)
        .filter(res => res.status !== 'キャンセル済み') 
        .sort((a, b) => new Date(a.dateObject.getTime()) - new Date(b.dateObject.getTime()));

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
    const { id, dateTime, duration, className, cancellableUntil, isInactive, displayStatus, dateObject } = reservation;
    
    let lessonStart;

    if (dateObject) {
        // renderReservationListから呼ばれている場合はこれを使う
        lessonStart = dateObject;
    } else {
        // 単体で呼ばれる場合のフォールバック
        const resDateTimeString = dateTime.replace(/\//g, '-');
        lessonStart = new Date(resDateTimeString);
    }

    const lessonEnd = new Date(lessonStart.getTime() + duration * 60000); 
    
    const now = new Date();
    const limit = new Date(cancellableUntil.replace(/\//g, '-'));
    
    const isCancellable = !isInactive && now < limit && reservation.status === '確定';
    
// 表示用時刻のフォーマット
    const formattedDate = lessonStart.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
    const formattedStartTime = lessonStart.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const formattedEndTime = lessonEnd.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const formattedTime = `${formattedDate} ${formattedStartTime}〜${formattedEndTime}`;

    const formattedLimit = limit.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) + ' ' + limit.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

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
        const message = `${formattedTime} の予約をキャンセルします。よろしいですか？`;
        item.querySelector('.cancel-button').addEventListener('click', () => handleCancel(id, message));
    }

    return item;
}

// ------------------------------
// キャンセル処理（カスタムモーダル）
// ------------------------------
const handleCancel = (id, message) => {
    showCustomModal(
        '予約のキャンセル',
        message,
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
        if (currentConfirmCallback) {
            modalConfirmBtn.disabled = true;

            try {
                await currentConfirmCallback();
            } catch (error) {
                console.error("Confirm callback failed:", error);
            } finally {
                modalConfirmBtn.disabled = false;
            }
        }
        hideCustomModal();
    });

    // キャンセルボタンの処理
    modalCancelBtn.addEventListener('click', () => {
        hideCustomModal();
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

// ====================================
// カレンダーの日付絞り込みロジック
// ====================================

/**
 * カレンダーの日付セルにイベントリスナーを設定する
 */
function setupCalendarDateListeners() {
    // リスナーの二重登録を防ぐため、既存のリスナーを一度削除（簡略化のため、DOMを再生成することで対応）

    const dayCells = calendarGrid.querySelectorAll('.date-cell > span'); 

    dayCells.forEach(cell => {
        // past-dayのセルはクリック対象外
        if (cell.classList.contains('past-day')) return;

        cell.addEventListener('click', (event) => {
            const dateString = event.currentTarget.getAttribute('data-date'); // YYYY-MM-DD 形式
            if (dateString) {
                filterReservationsByDate(dateString);
            }
        });
    });
}

/**
 * 予約リストをフィルタリングし、再描画する
 * @param {string} dateString - クリックされた日付 'YYYY-MM-DD'
 */
function filterReservationsByDate(dateString) {
    // 現在表示されているカレンダーの月を 'YYYY-MM' 形式で取得
    const currentMonthKey = `${currentCalendarDate.getFullYear()}-${String(currentCalendarDate.getMonth() + 1).padStart(2, '0')}`;

    // 現在この月に設定されているフィルター日付
    const currentFilter = monthFilterMap[currentMonthKey];

    // フィルターの切り替え処理
    if (currentFilter === dateString) {
        // 同じ日付がクリックされた場合（フィルター解除）
        delete monthFilterMap[currentMonthKey];
    } else {
        // 異なる日付がクリックされた場合（新しいフィルター設定）
        monthFilterMap[currentMonthKey] = dateString;
    }

    // リストの再描画
    renderReservationList();
    // 選択状態をカレンダーに反映
    updateCalendarSelection();
}

/**
 * カレンダーの選択状態を視覚的に更新する（強調表示）
 */
function updateCalendarSelection() {
    // 現在表示されているカレンダーの月を 'YYYY-MM' 形式で取得
    const currentMonthKey = `${currentCalendarDate.getFullYear()}-${String(currentCalendarDate.getMonth() + 1).padStart(2, '0')}`;
    const selectedFilterDate = monthFilterMap[currentMonthKey];

    document.querySelectorAll('.day-cell > span').forEach(cell => {
        const cellDate = cell.getAttribute('data-date');

        if (cellDate === selectedFilterDate) {
            cell.classList.add('selected-day'); 
        } else {
            cell.classList.remove('selected-day'); 
        }
    });
}

// ====================================
// 5. 予約画面 ロジック (修正・新規実装)
// ====================================

/**
 * 予約画面の初期設定と月移動リスナーのセットアップ
 */
function setupReservationScreen() {
    // 画面切り替え時にカレンダーをリセットして描画開始
    CURRENT_SCREEN_DATE.setDate(1); 
    fetchAndRenderCapacity(CURRENT_SCREEN_DATE);

    // 予約画面専用のボタンにリスナーを設定
    if (!prevMonthBtnRes.hasAttribute('data-res-listener')) {
        prevMonthBtnRes.addEventListener('click', () => {
            CURRENT_SCREEN_DATE.setMonth(CURRENT_SCREEN_DATE.getMonth() - 1);
            fetchAndRenderCapacity(CURRENT_SCREEN_DATE);
        });
        nextMonthBtnRes.addEventListener('click', () => {
            CURRENT_SCREEN_DATE.setMonth(CURRENT_SCREEN_DATE.getMonth() + 1);
            fetchAndRenderCapacity(CURRENT_SCREEN_DATE);
        });
        prevMonthBtnRes.setAttribute('data-res-listener', 'true');
    }
}

/**
 * 予約画面のカレンダー描画と、残席情報の取得・表示をメインで処理する
 * @param {Date} date - 表示する月
 */
async function fetchAndRenderCapacity(date) {
    // 1. カレンダーのUIを先に描画する (ローディング表示)
    renderReservationCalendar(date, 'loading'); 

    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; 
    let capacityData = {};

    // 2. GASからその月の予約可能クラス情報を取得する (mode: "getCapacityForMonth" を想定)
    try {
        const payload = { 
            mode: "getCapacityForMonth", 
            year: date.getFullYear(), 
            month: date.getMonth() + 1
        }; 
        const formBody = new URLSearchParams(payload);
        
        const res = await fetch(GAS_BASE_URL, {
            method: "POST", 
            headers: { "Content-Type": "application/x-www-form-urlencoded" }, 
            body: formBody
        });
        
        const json = await res.json();
        
        if (json.success && json.capacityData) {
            capacityData = json.capacityData; // { 'YYYY-MM-DD': [{...}, ...] }
            AVAILABLE_CAPACITY_DATA[monthKey] = capacityData; // メモリに保存
        } else {
            console.error("残席情報の取得に失敗しました", json.message);
        }
    } catch (e) {
        console.error("残席情報取得時の通信エラー", e);
    }

    // 3. 取得した残席情報を使ってカレンダーを再描画する
    renderReservationCalendar(date, 'loaded', capacityData);
}

// ------------------------------
// 予約画面のカレンダー描画ロジック 
// ------------------------------
function renderReservationCalendar(date, status, capacityData = {}) {
    
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    
    // ⭐️ 予約画面専用のDOM要素を参照
    currentMonthSpanRes.textContent = `${year}年 ${month + 1}月`; 
    calendarContainerRes.innerHTML = ''; // クリア

    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    // 予約可能月制限 (MAX_RESERVABLE_MONTHSに基づく)
    // MAX_RESERVABLE_MONTHS はグローバル変数に定義済みとする
    const maxReservableDateBoundary = new Date(today.getFullYear(), today.getMonth() + MAX_RESERVABLE_MONTHS, 1);

    // 【月移動ボタン制御】
    prevMonthBtnRes.disabled = (year === today.getFullYear() && month === today.getMonth());
    nextMonthBtnRes.disabled = (firstDayOfMonth.getTime() >= maxReservableDateBoundary.getTime());

    // 【曜日のヘッダー作成】
    const daysOfWeek = ['日', '月', '火', '水', '木', '金', '土'];
    let calendarHtml = '';
    daysOfWeek.forEach(day => { calendarHtml += `<div class="day-header">${day}</div>`; });

    // 【1日の開始曜日までの空セルを作成】
    const startDayOfWeek = firstDayOfMonth.getDay(); 
    for (let i = 0; i < startDayOfWeek; i++) {
        calendarHtml += '<div class="day empty"></div>';
    }

    // ⭐ 日付セルを作成
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const currentDateOnly = new Date(dateString); 
        
        let dayClass = 'day date-cell';
        let capacityInfo = ''; 
        let isReservable = false;
        
        if (currentDateOnly < TODAY_DATE_ONLY) {
            dayClass += ' past'; // 過去日
        } else {
            // capacityData は { 'YYYY-MM-DD': [{ ... }] } の形式
            const dayCapacity = capacityData[dateString] || [];
            
            if (dayCapacity.length > 0) {
                // その日に一つでも残席があるクラスがあれば予約可能
                const totalRemaining = dayCapacity.reduce((sum, item) => sum + item.remainingCapacity, 0);
                if (totalRemaining > 0) {
                    isReservable = true;
                    capacityInfo = `残り ${totalRemaining}`; // 日付の下に総残席数を表示
                }
            }

            if (isReservable) {
                dayClass += ' reservable clickable';
            } else {
                dayClass += ' fully-booked';
                capacityInfo = '満席';
            }
        }
        
        // ローディング中の表示
        if (status === 'loading') {
            capacityInfo = '読込中...';
            dayClass = 'day date-cell loading';
        }

        calendarHtml += `
            <div class="${dayClass}" data-date="${dateString}">
                ${day}
                <div class="capacity-info">${capacityInfo}</div> 
            </div>
        `;
    }
    
    // ⭐️ 予約画面専用のカレンダーコンテナに書き込む
    calendarContainerRes.innerHTML = calendarHtml;

    // ⭐ リスナー再設定 (reservable clickableな要素のみ)
    if (status === 'loaded') {
        calendarContainerRes.querySelectorAll('.day.clickable').forEach(cell => {
            cell.addEventListener('click', (event) => selectDate(event.currentTarget.dataset.date));
        });
    }
}

// ------------------------------
// 日付がクリックされたときの処理
// ------------------------------
function selectDate(dateString) {
    selectedDateText.textContent = `📅 ${dateString} の予約可能なクラス`;
    selectionDetails.classList.remove('hidden');
    
    // 該当日の残席情報を AVAILABLE_CAPACITY_DATA から取得し、リストを描画
    const monthKey = `${CURRENT_SCREEN_DATE.getFullYear()}-${String(CURRENT_SCREEN_DATE.getMonth() + 1).padStart(2, '0')}`;
    const monthCapacity = AVAILABLE_CAPACITY_DATA[monthKey] || {};
    const dayCapacity = monthCapacity[dateString] || [];

    // dateString を渡してボタンのデータ属性に持たせる
    renderAvailableClassesList(dayCapacity.filter(item => item.remainingCapacity > 0), dateString); 
}

// ------------------------------
// 予約可能クラスのリストを描画
// ------------------------------
function renderAvailableClassesList(classes, dateString) {
    let listHtml = '';
    
    if (classes.length === 0) {
        availableClassesList.innerHTML = '<p>この日は予約可能なクラスがありません。</p>';
        return;
    }

    classes.forEach(item => {
        listHtml += `
            <button class="class-select-button" 
                    data-lesson-id="${item.lessonId}" 
                    data-date="${dateString}" 
                    data-time="${item.startTime}">
                ${item.startTime} - ${item.className} (残席: ${item.remainingCapacity})
            </button>
        `;
    });
    
    availableClassesList.innerHTML = listHtml;
    
    // 予約ボタンのリスナー設定
    document.querySelectorAll('.class-select-button').forEach(button => {
        button.addEventListener('click', (event) => confirmReservation(event.currentTarget));
    });
}

// ------------------------------
// 予約確認モーダル表示
// ------------------------------
function confirmReservation(buttonElement) {
    const lessonId = buttonElement.dataset.lessonId;
    const dateString = buttonElement.dataset.date;
    const time = buttonElement.dataset.time;
    const classNameText = className //ユーザのクラス名を送信

    const message = `${dateString} ${time} の ${classNameText} を予約します。よろしいですか？`;

    showCustomModal(
        '予約の確定',
        message,
        () => handleReservation(lessonId, dateString, time, classNameText)
    );
}

// ------------------------------
// 予約確定処理（GASと通信）
// ------------------------------
async function handleReservation(lessonId, dateString, time, classNameText) {
    const payload = { 
        mode: "makeReservation", 
        userId: userId, 
        lessonId: lessonId,
        date: dateString, // YYYY-MM-DD
        time: time,       // HH:mm
        className: classNameText
    };
    const formBody = new URLSearchParams(payload);

    try {
        const res = await fetch(GAS_BASE_URL, { 
            method: "POST", 
            headers: { "Content-Type": "application/x-www-form-urlencoded" }, 
            body: formBody 
        });
        const json = await res.json();

        if (json.success) {
            alert("予約が完了しました！");
            // 予約成功後、カレンダーを再描画して残席情報を更新
            fetchAndRenderCapacity(CURRENT_SCREEN_DATE);
        } else {
            alert("予約に失敗しました: " + (json.message || "残席がないか、上限を超えています。"));
        }
    } catch (e) {
        alert("通信エラーが発生しました");
        console.error("予約通信エラー:", e);
    }
}
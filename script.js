// ====================================
// 1. グローバル変数と定数
// ====================================

// 既存のグローバル変数
const APP_VERSION = "VERSION_001"; // キャッシュ無効化用
const GAS_BASE_URL = "https://script.google.com/macros/s/AKfycbxQPiNqa3uHpnkrCiwlLL1CvHxZojD9PNqaUjV_-viiGDvZzelNEB_D-sQ3oAsixS78/exec";

// 予約画面用
let AVAILABLE_CAPACITY_DATA = {}; // { 'YYYY-MM-DD': [{ startTime: 'HH:mm', className: '...', remainingCapacity: N }, ...] }
let MY_RESERVIONS = {};
let MY_ATTEDED_DATES = [];
let CURRENT_SCREEN_DATE = new Date(); // 予約画面のカレンダー表示月
const MAX_RESERVABLE_MONTHS = 1; // (今月、来月)

// 予約画面用DOM要素
const reservationArea = document.getElementById("reservationArea");
const calendarContainerRes = document.getElementById('calendar-container-res'); // 予約画面のカレンダーグリッド本体
const currentMonthSpanRes = document.getElementById('current-month-res');       // 予約画面の月表示
const prevMonthBtnRes = document.getElementById('prev-month-btn-res');         // 予約画面の前月ボタン
const nextMonthBtnRes = document.getElementById('next-month-btn-res');         // 予約画面の次月ボタン
const selectionDetails = document.getElementById('selectionDetails'); 
const selectedDateText = document.getElementById('selectedDateText');
const availableClassesList = document.getElementById('availableClassesList');
const classInfo = document.getElementById('userClassInfo');

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
        await liff.init({ liffId: "2008592728-NkK9OenD" });

        if (!liff.isLoggedIn()) {
            liff.login(); 
            return;
        }
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

  const currentUser = sessionStorage.getItem('userInfo');
  if (currentUser) {
    document.getElementById("loading").classList.add("hidden");
    switchPage(false, JSON.parse(currentUser));
  } else {
    const accessToken = liff.getAccessToken();
    const userInfo = await fetchUserInfo(accessToken);
    
    document.getElementById("loading").classList.add("hidden");
  
    if (userInfo.exists && userInfo.data) {      
      //セッションストレージにユーザ情報を保存
      const sessionUserInfoJson = JSON.stringify(userInfo.data);
      sessionStorage.setItem('userInfo', sessionUserInfoJson);
  
      document.getElementById("user-select").classList.add("hidden");
      switchPage(false, userInfo.data);
      
    } else if (userInfo.data) {
      const { userId: fetchedUserId, displayName: fetchedDisplayName } = userInfo.data;
      document.getElementById("user-select").classList.remove("hidden");
      setupClassSelect(fetchedUserId, fetchedDisplayName, config);
    } else {
      console.error("ユーザー情報の取得に失敗しました。", userInfo.message);
      document.getElementById("errordisp").textContent = "ユーザー情報取得エラー: " + userInfo.message;
    }
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
// 授業選択画面の表示処理 
// -----------------------------
function setupClassSelect(userId, displayName, config) {
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
    confirmClassRegister(userId, displayName, selectedClassIndex, selectedUpperLimitNumber, config);
  });
}

// ------------------------------
// クラス登録確認モーダル表示
// ------------------------------
function confirmClassRegister(userId, displayName, classIndex, upperLimit, config) {
    const className = config.CLASS_INFO.CLASS_NAME[classIndex];

    const message = `クラスは「${className} 月${upperLimit}回」でよろしいですか？`;
    showCustomModal(
        'クラス登録',
        message,
        async () => {
            await registerUserClass(userId, displayName, classIndex, upperLimit, config);
        }
    );
}

async function registerUserClass(userId, displayName, classIndex, upperLimitNumber, config) {
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

    if (json.success) {      
      //セッションストレージにユーザ情報を保存
      const sessionUserInfoJson = JSON.stringify(json.userInfo);
      sessionStorage.setItem('userInfo', sessionUserInfoJson);

      alert("クラスの登録が完了しました！");
      switchPage(true, json.userInfo);
    } else {
      alert("クラスの登録に失敗しました！");
    }
  } catch (e) {
    alert("通信エラーが発生しました");
    console.log(e);
  }
}

// 操作するユーザ側でメッセージを送信する
// NOTE: 現状、使用していないが、念のため残しておく
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
// 画面切り替え
// ------------------------------
async function switchPage(registerFlag, userInfoJson = {}) {
  const reservation = reservationArea;
  const userSelect = document.getElementById("user-select");

  if (registerFlag) {
      userSelect.classList.add("hidden");
  }
  reservation.classList.remove("hidden");
  // ユーザのクラス・回数を画面上部に表示
  classInfo.innerHTML = `<span id='userName'>   👤 ${userInfoJson.displayName}</span><span id='userClassName'>  ┊  🖌️ ${userInfoJson.className} 🗓️ 月${userInfoJson.upperLimitNumber}回</span>`;
  setupReservationScreen();
}

// ====================================
// 予約画面 ロジック
// ====================================

/**
 * 予約画面の初期設定と月移動リスナーのセットアップ
 */
function setupReservationScreen() {
    // 画面切り替え時にカレンダーをリセットして描画開始
    CURRENT_SCREEN_DATE.setDate(1); 
    // 時刻情報もクリアして、0時0分0秒に設定
    CURRENT_SCREEN_DATE.setHours(0, 0, 0, 0);
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

    // セッションストレージからユーザ情報取得
    const currentUser = getSessionUserInfo();
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; 
    let capacityData = {};
    let myReservations = [];
    let myAttendedDates = [];

    // 2. GASから統合されたカレンダー情報を取得する
    try {
      const payload = { 
          mode: "getCalendarData",
          year: date.getFullYear(), 
          month: date.getMonth() + 1,
          monthKey: monthKey,
          userId: currentUser.userId
      }; 
      const formBody = new URLSearchParams(payload);
      
      const res = await fetch(GAS_BASE_URL, {
          method: "POST", 
          headers: { "Content-Type": "application/x-www-form-urlencoded" }, 
          body: formBody
      });
      
      const json = await res.json();
      
      if (json.success) {
        // 💡 統合されたレスポンスから両方のデータを取得
        capacityData = json.capacityData || {};
        myReservations = json.myReservedDates || [];
        myAttendedDates = json.myAttendedDates || [];

        AVAILABLE_CAPACITY_DATA[monthKey] = capacityData; // 残席情報のみメモリに保存
        MY_RESERVIONS[monthKey] = myReservations;
        MY_ATTEDED_DATES = myAttendedDates;
      } else {
          console.error("カレンダー情報の取得に失敗しました", json.message);
      }
    } catch (e) {
        console.error("カレンダー情報取得時の通信エラー", e);
    }

    // 3. 取得した残席情報と予約日リストを使ってカレンダーを再描画する
    renderReservationCalendar(date, 'loaded', capacityData, myReservations, myAttendedDates);
}

// ------------------------------
// 予約画面のカレンダー描画ロジック 
// ------------------------------
function renderReservationCalendar(date, status, capacityData = {}, myReservations = [], myAttendedDates = []) {
    
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    
    // 予約画面専用のDOM要素を参照
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
    daysOfWeek.forEach(day => { calendarHtml += `<div class="calendar-day-header">${day}</div>`; });

    // 【1日の開始曜日までの空セルを作成】
    const startDayOfWeek = firstDayOfMonth.getDay(); 
    for (let i = 0; i < startDayOfWeek; i++) {
        calendarHtml += '<div class="calendar-cell inactive"></div>';
    }

    // ⭐ 日付セルを作成
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const currentDateOnly = new Date(dateString); 
        
        let dayClass = 'calendar-cell';
        let capacityInfo = ''; 
        let isReservable = false;
        let isMyReserved = false; // 予約済みフラグを追加
        let isMyAttended = false;
        // capacityData は { 'YYYY-MM-DD': [{ ... }] } の形式
        const dayCapacity = capacityData[dateString] || [];
        
        if (currentDateOnly < today) {
            dayClass += ' inactive';
            // 受講済みチェック(過去日は授業なし判定と同じになるので、ここでチェック)
            const myAttendedDateCheck = myAttendedDates.some(dateTimeString => dateTimeString.includes(dateString));
            if (myAttendedDateCheck) {
                dayClass += ' my-attended';
                isMyAttended = true;
            }
        } else {
          // --- 授業なしの判定 ---
          if (dayCapacity.length === 0) {
              // 授業なし：提案色（薄い灰色）の inactive を使用
              dayClass += ' no-lesson inactive'; // 授業なしの日
          } else {
            // --- 授業あり（予約可能/満席の判定） ---
            const totalRemaining = dayCapacity.reduce((sum, item) => sum + item.remainingCapacity, 0);

            if (totalRemaining > 0) {
                // 空席あり：緑 (reservable clickable)
                dayClass += ' available clickable';
                capacityInfo = '予約可'; 
                isReservable = true;
            } else {
                // 満席：赤 (fully-booked full)
                dayClass += ' fully-booked full';
                capacityInfo = '満席';
            }
            
            // --- 予約済みの判定 ---
            // myReservations は 'YYYY-MM-DD' の日付文字列の配列と想定なのでsome + inculudesで判定（実際は、'YYYY-MM-DD HH:mm'　リスト表示で必要）
            const reservedCheck = myReservations.some(dateTimeObj => {
              const keys = Object.keys(dateTimeObj);
              return keys.some(key => key.includes(dateString));
            });
            if (reservedCheck) {
                // 予約済みの日：青 (my-reserved)
                dayClass += ' my-reserved';
                isMyReserved = true;
            }
          }
        }
        
        // ローディング中の表示
        if (status === 'loading') {
            capacityInfo = '読込中...';
            dayClass = 'calendar-cell loading'; // ロード中は上書き
        }

        calendarHtml += `
            <div class="${dayClass}" data-date="${dateString}">
                <span class="date-number">${day}</span>
                ${isMyAttended ? '<span class="my-attended-badge">受講済</span>' : ''}
                ${isMyReserved ? '<span class="my-reserved-badge">予約済</span>' : ''} 
                ${isReservable || dayCapacity.length > 0 ? `<div class="capacity-indicator">${capacityInfo}</div>` : ''}
            </div>
        `;
    }
    
    // ⭐️ 予約画面専用のカレンダーコンテナに書き込む
    calendarContainerRes.innerHTML = calendarHtml;

    // ⭐ リスナー再設定 (reservable clickableな要素のみ)
    if (status === 'loaded') {
        calendarContainerRes.querySelectorAll('.calendar-cell.clickable').forEach(cell => {
            cell.addEventListener('click', (event) => selectDate(event.currentTarget.dataset.date));
        });
    }
}

// ------------------------------
// 日付がクリックされたときの処理
// ------------------------------
function selectDate(dateString) {
  selectedDateText.textContent = `📅 ${dateString} 授業一覧`;
  selectionDetails.classList.remove('hidden');
  
  // 該当日の残席情報を AVAILABLE_CAPACITY_DATA から取得し、リストを描画
  const monthKey = `${CURRENT_SCREEN_DATE.getFullYear()}-${String(CURRENT_SCREEN_DATE.getMonth() + 1).padStart(2, '0')}`;
  const monthCapacity = AVAILABLE_CAPACITY_DATA[monthKey] || {};
  const dayCapacity = monthCapacity[dateString] || [];

  // dateString を渡してボタンのデータ属性に持たせる
  renderAvailableClassesList(dayCapacity, dateString, monthKey);
  // renderAvailableClassesList(dayCapacity.filter(item => item.remainingCapacity > 0), dateString); 
}

// ------------------------------
// 予約可能クラスのリストを描画
// ------------------------------
function renderAvailableClassesList(classes, dateString, monthKey) {
  // セッションストレージからユーザ情報取得
  const currentUser = getSessionUserInfo();
  const upperLimit = currentUser.upperLimit;

  let listHtml = '';

  let isAvailableClass = false;
  const monthReservation = MY_RESERVIONS[monthKey] || {};
  const reservedCount = monthReservation.length;
  const AttendedCount = MY_ATTEDED_DATES.filter(item => item.includes(monthKey)).length;
  const userLimitReached = (reservedCount + AttendedCount) == upperLimit;

  classes.forEach(item => {
    // MY_RESERVIONSから取得して、予約済み時間を特定
    const isReserved = monthReservation.some(dateTimeObj => {
      const keys = Object.keys(dateTimeObj);
      return keys.some(key => key.includes(`${dateString} ${item.startTime}`));
    });
    const isFull = item.remainingCapacity <= 0;
    let buttonHtml = '';

    // -----------------------------------------------------------------
    // A. 自分が予約済みの場合: キャンセルボタンを表示
    // -----------------------------------------------------------------
    if (isReserved) {
      buttonHtml = `
            <span class="status-text reserved-info">${item.startTime} - ${item.endTime} ${item.className}</span><br>
            <span class="reserved-class">✅ 予約済み</span>
            <button class="class-select-button is-reserved-cancel" 
                    data-action="cancel" 
                    data-date="${dateString}" 
                    data-time="${item.startTime} - ${item.endTime}"
                    data-reservation-id="${item.reservationId}">
                キャンセルする
            </button>
        `;
      isAvailableClass = true;
    // -----------------------------------------------------------------
    // B. 予約可能で、満席でも上限でもない場合: 予約ボタンを表示
    // -----------------------------------------------------------------
    } else if (!isFull && !userLimitReached) {
      buttonHtml = `
          <span class="status-text available-info">${item.startTime} - ${item.endTime} ${item.className}</span><br>
          <span class="remaining-class-number">👤 残り${item.remainingCapacity}席</span>
          <button class="class-select-button is-available-reserve" 
                  data-action="reserve" 
                  data-lesson-id="${item.lessonId}" 
                  data-date="${dateString}" 
                  data-time="${item.startTime} - ${item.endTime}">
              予約する
          </button>
      `;
      isAvailableClass = true;
    } else {
      let reason = isFull ? '満席' : '上限到達';
         buttonHtml = `
            <span class="status-text is-unavailable">${item.startTime} - ${item.endTime} ${item.className}</span><br>
            <span class="unavailable-reason">※${reason}のため予約不可</span>
         `;
    }

    listHtml += `<div class="time-slot-container">${buttonHtml}</div>`;
  });
  
  if (!isAvailableClass) {
      availableClassesList.innerHTML = '<p>予約可能な授業がありません。</p>';
      return;
  }

  availableClassesList.innerHTML = listHtml;
  
  // 予約ボタンのリスナー設定
  document.querySelectorAll('.is-available-reserve').forEach(button => {
      button.addEventListener('click', (event) => confirmReservation(event.currentTarget));
  });
  // キャンセルボタンのリスナー設定
  document.querySelectorAll('.is-reserved-cancel').forEach(button => {
    button.addEventListener('click', (event) => confirmReservationCancel(event.currentTarget));
  });
}

// ------------------------------
// 予約確認モーダル表示
// ------------------------------
function confirmReservation(buttonElement) {
  const lessonId = buttonElement.dataset.lessonId;
  const dateString = buttonElement.dataset.date;
  const time = buttonElement.dataset.time;
  // セッションストレージからユーザ情報取得
  const currentUser = getSessionUserInfo();
  const classNameText = currentUser.className; //ユーザのクラス名を送信
  const userId = currentUser.userId; //ユーザIDを送信

  const message = `${dateString} ${time} の ${classNameText} を予約します。よろしいですか？`;

  showCustomModal(
      '予約の確定',
      message,
      async () => {
          await handleReservation(lessonId, dateString, time, classNameText, userId);
      }
  );
}

// ------------------------------
// 予約確定処理（GASと通信）
// ------------------------------
async function handleReservation(lessonId, dateString, time, classNameText, userId) {
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
            // 選択エリアは非表示にする
            selectionDetails.classList.add('hidden');
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

// ------------------------------
// キャンセル処理（カスタムモーダル）
// ------------------------------
function confirmReservationCancel(buttonElement) {
  const dateString = buttonElement.dataset.date;
  const time = buttonElement.dataset.time;
  const reservationId = buttonElement.dataset.reservationId;
  // セッションストレージからユーザ情報取得
  const currentUser = getSessionUserInfo();
  const classNameText = currentUser.className; //ユーザのクラス名を送信
  const userId = currentUser.userId

  const message = `${dateString} ${time} の ${classNameText} をキャンセルします。よろしいですか？`;

  showCustomModal(
      '予約のキャンセル',
      message,
      async () => {
          await executeCancellation(userId, reservationId);
      }
  );
}

// ------------------------------
// GASへのキャンセルAPIコール
// ------------------------------
async function executeCancellation(userId, reservationId) {
  const payload = { mode: "cancelReservation", userId: userId, reservationId: reservationId };
  const formBody = new URLSearchParams(payload);

  try {
      const res = await fetch(GAS_BASE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody });
      const json = await res.json();
      
      if (json.success) {
        alert("キャンセルが完了しました。");
        // 選択エリアは非表示にする
        selectionDetails.classList.add('hidden');
        // 予約成功後、カレンダーを再描画して残席情報を更新
        fetchAndRenderCapacity(CURRENT_SCREEN_DATE);
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
// カスタムモーダル イベントリスナー設定
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

// ==========================================
// セッションストレージに設定したユーザ情報を取得
// ==========================================
function getSessionUserInfo() {
    const userInfoJson = sessionStorage.getItem('userInfo');

    if (!userInfoJson) {
      alert("ユーザ情報が取得できませんでした。一度、画面を閉じて開き直してください。");
      liff.closeWindow();
      return null;
    }
    // JSON文字列をオブジェクトに戻す
    const userInfo = JSON.parse(userInfoJson);
    return userInfo;
}
let categories = JSON.parse(localStorage.getItem("categories")) || [];
let scores = JSON.parse(localStorage.getItem("scores")) || {};
let statusPoints = JSON.parse(localStorage.getItem("statusPoints")) || {}; // ステータス用ポイント（別管理）
// ポモドーロ設定を localStorage で保持
let pomodoro = JSON.parse(localStorage.getItem("pomodoro")) || { work: 25, break: 5, long: 15 };
let pastScores = JSON.parse(localStorage.getItem("pastScores")) || {};
let lastWeek = localStorage.getItem("lastUpdatedWeek");
let playerLevel = parseInt(localStorage.getItem("playerLevel") || "0");
// RPGステータス名リスト
const statusNames = ["ATK", "DEF", "HP", "MP", "SPD"];
// カテゴリとステータスを紐付け{カテゴリ名: ステータス名}
let categoryToStatus = JSON.parse(localStorage.getItem("categoryToStatus")) || {};
let categoryTargets = JSON.parse(localStorage.getItem("categoryTargets")) || {};
// 例: { ATK: "体力", DEF: "防御力", HP: "体力", MP: "魔力", SPD: "敏捷" }
let statMapping = JSON.parse(localStorage.getItem("statMapping")) || {}; 

let enemyQueue = [];  // 敵の順番
let currentEnemyIndex = 0;
let enemy = null;
let enemyHP = 0;
let playerHP;
let playerMP; 
let statusMultipliers = JSON.parse(localStorage.getItem("statusMultipliers")) || {
  HP: 1,
  MP:1,
  ATK: 1,
  DEF: 1,
  SPD: 1
};

let savePoint = 0;      // 最高到達ステージ (中ボスごと)
let dailyLog = JSON.parse(localStorage.getItem("dailyLog")) || {};
// missionPoints はミッション機能削除により基本使わないが、calculateStatus が参照するため安全な初期化
let missionPoints = {};

// quest/subquest 機能は廃止
try {
  localStorage.removeItem('categoryQuests');
  localStorage.removeItem('categorySubquests');
  localStorage.removeItem('lastSubquestDate');
} catch (e) { /* ignore */ }

function getCurrentWeek() {
  const date = new Date();
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7; // 月曜始まりに変換（0=月曜）
  target.setDate(target.getDate() - dayNr + 3); // 木曜基準に調整

  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const weekNumber = Math.ceil(((target - firstThursday) / 86400000 + 1) / 7);
  return weekNumber;
}

// local date helper (YYYY-MM-DD)
function getLocalDateString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Daily pomodoro count management.
const POMODORO_DAILY_COUNT_KEY = 'pomodoroDailyCount';
const POMODORO_DAILY_DATE_KEY = 'pomodoroDailyDate';

function ensurePomodoroDailyCounter() {
  const today = getLocalDateString();
  const savedDate = localStorage.getItem(POMODORO_DAILY_DATE_KEY);
  if (savedDate !== today) {
    localStorage.setItem(POMODORO_DAILY_DATE_KEY, today);
    localStorage.setItem(POMODORO_DAILY_COUNT_KEY, '0');
    return 0;
  }
  return Number(localStorage.getItem(POMODORO_DAILY_COUNT_KEY) || 0);
}

function incrementPomodoroDailyCounter() {
  const current = ensurePomodoroDailyCounter();
  const next = current + 1;
  localStorage.setItem(POMODORO_DAILY_COUNT_KEY, String(next));
  return next;
}

// 指定日付の週番号を算出（getCurrentWeek と同じロジックを任意日付で使う）
function getWeekNumberForDate(dateObj) {
  const target = new Date(dateObj.valueOf());
  const dayNr = (dateObj.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const weekNumber = Math.ceil(((target - firstThursday) / 86400000 + 1) / 7);
  return weekNumber;
}

function checkWeekRollover() {
  const currentWeek = getCurrentWeek();
  if (lastWeek && lastWeek !== currentWeek.toString()) {
    console.log("週が変わったので過去スコアを保存:", scores); // ← 追加
    pastScores = { ...scores };
    localStorage.setItem("pastScores", JSON.stringify(pastScores));
    // NOTE: weekly automatic reset of subquests was removed. Subquest texts are preserved.
    alert("週が変わったので、過去スコアを更新しました！");
  }
  localStorage.setItem("lastUpdatedWeek", currentWeek.toString());
}

function save() {
  localStorage.setItem("categories", JSON.stringify(categories));
  localStorage.setItem("scores", JSON.stringify(scores));
  localStorage.setItem("statusPoints", JSON.stringify(statusPoints));
  localStorage.setItem("categoryTargets", JSON.stringify(categoryTargets));
  localStorage.setItem("playerLevel", playerLevel);
  localStorage.setItem("categoryToStatus", JSON.stringify(categoryToStatus)); // ← 追加
}


function addCategory() {
  const input = document.getElementById("categoryInput");
  const name = input.value.trim();
  if (!name) return alert("カテゴリ名を入力してください");
  if (categories.includes(name)) return alert("すでに存在します");

  categories.push(name);
  scores[name] = 0;
  statusPoints[name] = 0; // ステータス初期化
  // ミッション機能を削除したため初期化処理は不要

  input.value = "";
  save();
  render();
}

function deleteCategories() {
  const toDelete = prompt("削除するカテゴリ名を空白区切りで入力(複数可):");
  if (!toDelete) return;
  const targets = toDelete.split(" ").map((s) => s.trim());
  categories = categories.filter((c) => !targets.includes(c));
  for (let t of targets) {
    delete scores[t];
    delete statusPoints[t];
  }
  save();
  render();
}

function updateScore(cat, delta) {
  scores[cat] = Math.max(0, (scores[cat] || 0) + delta);
  const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
  if (!dailyLog[today]) dailyLog[today] = {};
  dailyLog[today][cat] = (dailyLog[today][cat] || 0) + delta;
  localStorage.setItem("dailyLog", JSON.stringify(dailyLog));
  recalcLevel();
  save();
  render();
}

/*prompt用
function renameCategory(oldName) {
  const newName = prompt(`「${oldName}」の新しい名前を入力:`);
  if (!newName) return;
  const trimmed = newName.trim();
  if (!trimmed) return alert("名前が空です");
  if (categories.includes(trimmed)) return alert("すでに存在しています");

  const idx = categories.indexOf(oldName);
  if (idx !== -1) categories[idx] = trimmed;

  scores[trimmed] = scores[oldName];
  delete scores[oldName];

  if (pastScores[oldName] !== undefined) {
    pastScores[trimmed] = pastScores[oldName];
    delete pastScores[oldName];
  }

  // ...existing code... (old rename handler removed)
  save();
  render();
}
*/

function enableEdit(labelElement, oldName) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = oldName;
  input.style.width = "50%";
  input.style.fontSize = "16px";

  const confirmEdit = () => {
    const newName = input.value.trim();
    if (!newName || newName === oldName) return render();
    if (categories.includes(newName)) return alert("すでに存在しています");

    const idx = categories.indexOf(oldName);
    if (idx !== -1) categories[idx] = newName;

    scores[newName] = scores[oldName];
    delete scores[oldName];

    if (pastScores[oldName] !== undefined) {
      pastScores[newName] = pastScores[oldName];
      delete pastScores[oldName];
    }

    if (statusPoints?.[oldName] !== undefined) {
      statusPoints[newName] = statusPoints[oldName];
      delete statusPoints[oldName];
    }
    save();
    render(); // ← ラベルに戻す
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmEdit();
    if (e.key === "Escape") render(); // キャンセル
  });

  input.addEventListener("blur", confirmEdit); // ← これが重要！

  labelElement.replaceWith(input);
  input.focus();
}

function render() {
  const list = document.getElementById("categoryList");
  list.innerHTML = "";

  for (let cat of categories) {
    const div = document.createElement("div");
    div.className = "score-row";
    div.draggable = true;
    div.dataset.cat = cat;

    // ドラッグイベント
    div.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", cat);
    });
    div.addEventListener("dragover", (e) => e.preventDefault());
    div.addEventListener("drop", (e) => {
      e.preventDefault();
      const draggedCat = e.dataTransfer.getData("text/plain");
      const targetCat = e.currentTarget.dataset.cat;
      const fromIndex = categories.indexOf(draggedCat);
      const toIndex = categories.indexOf(targetCat);
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        const moved = categories.splice(fromIndex, 1)[0];
        categories.splice(toIndex, 0, moved);
        save();
        render();
      }
    });

    const targetPt = (categoryTargets && categoryTargets[cat]);// || 10;

    // カテゴリ名ラベル
    const scoreLabel = document.createElement("span");
    scoreLabel.className = "score-label";
    scoreLabel.textContent = `${cat}`;
    scoreLabel.style.width = "30%";
    scoreLabel.style.cursor = "pointer";
    scoreLabel.onclick = () => enableEdit(scoreLabel, cat);

    // スコア / 目標表示（編集可能）
    const targetDisplay = document.createElement("span");
    targetDisplay.className = "target-display";
    targetDisplay.textContent = `${scores[cat] || 0} / ${targetPt} pt`;
    targetDisplay.style.cursor = "pointer";
    targetDisplay.onclick = () => {
      const input = document.createElement("input");
      input.type = "number";
      input.min = 1;
      input.style.fontSize = "16px";
      input.value = targetPt;
      input.className = "target-input";
      input.onblur = () => {
        categoryTargets[cat] = Number(input.value);
        save();
        render();
      };
      targetDisplay.replaceWith(input);
      input.focus();
    };

    // ±ボタン
    const minus = document.createElement("button");
    minus.textContent = "－";
    minus.className = "zoom-safe-button";
    minus.onclick = () => updateScore(cat, -1);

  const plus = document.createElement("button");
  plus.textContent = "＋";
  plus.className = "zoom-safe-button";
  plus.onclick = () => startFiveMinutePomodoro(cat);

    const buttonGroup = document.createElement("div");
    buttonGroup.className = "score-buttons";
    buttonGroup.append(minus, plus);

    // 要素追加（順番が重要）
    div.append(scoreLabel, targetDisplay, buttonGroup);
    list.appendChild(div);

  }

  function renderCalendar() {
    const container = document.getElementById("calendarArea");
    container.innerHTML = "<h2>履歴</h2>";

    const dates = Object.keys(dailyLog).sort().reverse(); // 新しい順
    for (const date of dates) {
      const entry = dailyLog[date];
      const div = document.createElement("div");
      div.style.marginBottom = "10px";
      div.innerHTML = `<strong>${date}</strong><br>`;
      for (const [cat, val] of Object.entries(entry)) {
        div.innerHTML += `・${cat}: ${val}pt<br>`;
      }
      container.appendChild(div);
    }
  }

  updateChart();
  renderCalendar(); // ← これを追加
  // ステータス表示を最新化
  try { renderStatus(); } catch(e) { /* ignore */ }
}

const menuBtn = document.getElementById("menuBtn");
const gameMenu = document.getElementById("gameMenu");
const assignCategoryArea = document.getElementById("assignCategoryArea");
const closeMenuBtn = document.getElementById("closeMenuBtn");
const resetProgress = document.getElementById("resetProgressBtn");

menuBtn.onclick = () => {
  menuBtn.style.display = "none"; // メニューボタン非表示
  gameMenu.style.display = "block";
};

closeMenuBtn.onclick = () => {
  gameMenu.style.display = "none";
  assignCategoryArea.style.display = "none"; // 割り当て画面も同時に非表示
  menuBtn.style.display = "inline-block"; // メニュー再表示
};

//カテゴリ割り当て
document.getElementById("assignCategoryBtn").onclick = renderAssignCategories;

// askMissionClearStatus removed (mission system deprecated)

async function goToGame() {
  document.getElementById("recordArea").style.display = "none";
  document.getElementById("gameArea").style.display = "block";
  renderStatus();
}

function goToRecord() {
  document.getElementById("gameArea").style.display = "none";
  document.getElementById("recordArea").style.display = "block";
}

// カテゴリのポイントをもとにステータスを計算
function calculateStatus() {
  const result = {};
  for (const stat of statusNames) {
    const cat = statusPoints[stat];
    if (!cat || !categories.includes(cat)) {
      // 未割り当ては 0
      result[stat] = 0;
      continue;
    }
    // 各カテゴリのスコア + ミッションポイントを合計してステータスにする
    const score = scores[cat] || 0;
    const mp = missionPoints[cat] || 0;
    const multiplier = statusMultipliers[stat] || 1;

    // スコア + ミッションポイント に倍率をかける
    result[stat] = Math.floor((score + mp) * multiplier);
  }
  return result;
}

// Legacy weekly mission rollover removed

function renderAssignCategories() {
  assignCategoryArea.style.display = "block"; // ここを必ず表示
  assignCategoryArea.innerHTML = ""; // 前の内容をクリア

  for (let stat of statusNames) {
    const div = document.createElement("div");
    div.className = "assign-row";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.marginBottom = "5px";

    const label = document.createElement("span");
    label.textContent = stat + ": ";
    label.style.width = "50px";

    const select = document.createElement("select");
    select.style.flex = "1";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "未割り当て";
    select.appendChild(defaultOption);

    for (let cat of categories) {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      select.appendChild(option);
      // 既に割り当て済みなら選択状態に
      if (categoryToStatus[cat] === stat) {
        option.selected = true;
      }
    }

    select.onchange = () => {
      const selectedCat = select.value;
      // ステータス → カテゴリ
      statusPoints[stat] = selectedCat || null;

      // カテゴリ → ステータス
      // まず、以前そのステータスに割り当てられていたカテゴリがあれば削除
      for (let cat in categoryToStatus) {
        if (categoryToStatus[cat] === stat) delete categoryToStatus[cat];
      }

      if (selectedCat) {
        categoryToStatus[selectedCat] = stat;
      }

      save();
      renderStatus();
      recalcLevel();

      if (gameInitialized) startNextEnemy();
    };

/*
    select.onchange = () => {
      statusPoints[stat] = select.value; // ステータス → カテゴリ
      categoryToStatus[select.value] = stat; // カテゴリ → ステータス
      save(); // 必要なら localStorage に保存
      renderStatus(); // ステータス更新
      recalcLevel();// レベルも再計算
      // 割り当てが変わったら、敵のベースポイントも更新
      // ゲーム中の場合は次の敵から反映
      if (gameInitialized) {
        startNextEnemy(); // 既存の敵は再生成して初期化
      }
    };
*/
      

    div.append(label, select);
    assignCategoryArea.appendChild(div);
  }
}

//レベル計算
function recalcLevel() {
  if (categories.length === 0) return;

  // 割り当て済みカテゴリだけを使う
  const relevantScores = categories
    .filter(cat => categoryToStatus[cat])
    .map(cat => scores[cat] || 0);

  if (relevantScores.length === 0) return;

  const minScore = Math.min(...relevantScores);

  if (minScore > playerLevel) {
    playerLevel = minScore;
    alert(`レベル${playerLevel}にアップ！`);
  } else if (minScore < playerLevel) {
    playerLevel = minScore;
    alert(`レベルが${playerLevel}に下がりました…`);
  }
  save();
}


function renderStatus() {
  const statusArea = document.getElementById("statusList");
  const status = calculateStatus();
  statusArea.innerHTML = `<div>レベル: ${playerLevel}</div>`;

  for (const stat of statusNames) {
    const div = document.createElement("div");
    div.textContent = `${stat}: ${status[stat]} pt`;
    statusArea.appendChild(div);
  }
}

let gameInitialized = false;

document.addEventListener("DOMContentLoaded", () => { 
  const startBtn = document.getElementById("startGameBtn");
  if (!startBtn) { 
    console.error("startGameBtn が見つかりません"); 
    return; 
  }

  startBtn.onclick = () => {
    console.log("startGame pressed");

    // セーブポイントがあればロード
    const saved = localStorage.getItem("savePoint");
    if (saved) {
      savePoint = Number(saved);
      currentEnemyIndex = savePoint;
      logBattle(`セーブ地点 (ステージ${savePoint}) から再開します！`);

      // Goldの復元
      const savedGold = localStorage.getItem("gold");
      if (savedGold !== null) {
        gold = Number(savedGold);
        logBattle(`所持Gold: ${gold} を復元しました`);
      }

      // ステータス倍率の復元
      const savedMultipliers = localStorage.getItem("statusMultipliers");
      if (savedMultipliers) {
        statusMultipliers = JSON.parse(savedMultipliers);
        logBattle(`ステータス倍率を復元しました`);
      }

    } else {
      savePoint = 0;
      currentEnemyIndex = 0;
      gold = 0;
      statusMultipliers = {
        HP: 1,
        MP: 1,
        ATK: 1,
        DEF: 1,
        SPD: 1
      };
    }

    startGame();
  };
});


// 目標ポイントを収集（記録画面の入力値を反映）
function gatherCategoryTargets() {
  const stored = localStorage.getItem("categoryTargets");
  categoryTargets = stored ? JSON.parse(stored) : {};
}

function startGame() {
  gatherCategoryTargets(); // 目標ポイントを集める

  // ステータス割り当てがあるかチェック
  const assigned = Object.values(categoryToStatus).filter(v => v);
  console.log(categoryToStatus);
  if (assigned.length === 0) {
    alert("ステータスにカテゴリが割り当てられていません！");
    renderAssignCategories();
    return;
  }

  // バトルログをクリア
  document.getElementById("battleLog").innerHTML = "";

  // セーブ地点（チェックポイント）を確認
  currentEnemyIndex = savePoint;
  
  
  startNextEnemy(); // 敵生成

  document.getElementById("gameArea").style.display = "block";
  document.getElementById("recordArea").style.display = "none";
  document.getElementById("battleArea").style.display = "block";

  document.getElementById("startGameBtn").disabled = true;
}


function createEnemy(name, stats, index, isBoss = false) {
  return {
    name: name,
    HP: stats.HP,
    maxHP: stats.HP,
    ATK: stats.ATK,
    DEF: stats.DEF,
    SPD: stats.SPD,  // 追加
    isBoss: isBoss
  };
}


function logBattle(msg) {
  const logDiv = document.getElementById("battleLog");
  if (!logDiv) return;

  // メッセージを追記
  logDiv.innerHTML += msg + "<br>";

  // 自動スクロール：最新のメッセージが下端に来る
  logDiv.scrollTop = logDiv.scrollHeight;
}


function startNextEnemy() {
  const i = currentEnemyIndex + 1; // 倒した敵数に応じた段階
  const totalStages = 1000000;          // ボスに到達するまでの段階数
  const stageFactor = Math.min(i / totalStages, 1); // 0→1で段階的上昇

  // スコアチェック：目標ポイントを超えたカテゴリ数
  const clearedCount = Object.keys(categoryToStatus).filter(cat => {
    const score = scores[cat] || 0;
    const target = categoryTargets[cat] || 10;
    return score >= target;
  }).length;

  // 敵の名前とボス判定
  let enemyName = `スライム${i}`;
  let isBoss = false;
  if (i % 5 === 0) {
    if (clearedCount >= 3 && i % 25 === 0) { // 条件に応じて最終ボス出現
      enemyName = "ドラゴンボス";
      isBoss = true;
    } else {
      enemyName = `ゴブリン中ボス${i/5}`;
      isBoss = true;
    }
  }

    // カテゴリからステータス割り当て
  const baseStats = {};
  for (const cat in categoryToStatus) {
    const stat = categoryToStatus[cat];
    const targetPt = categoryTargets[cat];// || 10;
    baseStats[stat] = targetPt;
  }

  if (Object.keys(baseStats).length === 0) {
    alert("ステータスが未設定です！");
    renderAssignCategories();
    return;
  }

  // 段階的強化：stageFactorを使って目標値に到達する
  const enemyStats = {};
  for (const cat in categoryToStatus) {
    const stat = categoryToStatus[cat];
    const maxVal = Number(categoryTargets[cat]) || 10; // 目標ポイントを上限に
    const base = 1;
    const value = base + i; // 成長値（倒した敵数に応じて）
    enemyStats[stat] = Math.min(value, maxVal); // 上限を超えないように制限
  }



  enemy = createEnemy(enemyName, enemyStats, i, isBoss);
  enemyHP = enemy.HP;
  if (playerHP === undefined) {
    playerHP = calculateStatus().HP; // 初回のみ満タン
  }

  if (playerMP === undefined) {
    playerMP = calculateStatus().MP; // 初回のみ満タン
  }
  logBattle(`${enemy.name}が現れた！ (HP:${enemy.HP} ATK:${enemy.ATK} DEF:${enemy.DEF} SPD:${enemy.SPD})`);

  document.getElementById("attackBtn").disabled = false;
  currentEnemyIndex++;
}


let gold = 0;

function attack() {
  const status = calculateStatus();

  // 先攻はSPDが高い方
  const playerSPD = status.SPD || 5;
  let playerFirst = playerSPD >= enemy.SPD;

  function playerAttack() {
    let damage = Math.max(1, status.ATK - enemy.DEF);
    enemyHP -= damage;
    logBattle(`あなたの攻撃！${damage}のダメージ！ 残り敵HP: ${enemyHP}`);
  }

  function enemyAttack() {
    let damage = Math.max(1, enemy.ATK - status.DEF);
    playerHP -= damage;
    logBattle(`${enemy.name}の攻撃！${damage}のダメージ！ 残りあなたのHP: ${playerHP}  残りあなたのMP: ${playerMP}`);
  }

  if (playerFirst) {
    playerAttack();
    if (enemyHP > 0) enemyAttack();
  } else {
    enemyAttack();
    if (playerHP > 0) playerAttack();
  }

  if (enemyHP <= 0) {
    const reward = enemy.isBoss ? 50 : 10;
    gold += reward;
    logBattle(`${enemy.name}を倒した！ゴールド +${reward} (所持: ${gold})`);
    onEnemyDefeated();
    startNextEnemy(); // 次の敵を生成
    return;
  }

  if (playerHP <= 0) {
    onPlayerDeath();
    return;
  }
}

/* アイテム購入
function buyPotion() {
  if (gold < 50) { alert("ゴールドが足りない！"); return; }
  gold -= 50;
  playerMP += 15;
  logBattle(`Goldを50消費してMPを15回復！`);
  logBattle(`残りあなたのHP: ${playerHP}  残りあなたのMP: ${playerMP}  残りあなたのGold: ${gold}`);
}
*/

function upgradeStat(stat) {
  const baseCost = 30;
  const currentMultiplier = statusMultipliers[stat] || 1;
  const level = Math.floor((currentMultiplier - 1) / 0.2);
  const cost = baseCost + level * 20;

  if (gold < cost) {
    logBattle(`${stat}強化に必要なGoldが足りません！（必要: ${cost}G）`);
    return;
  }

  gold -= cost;
  statusMultipliers[stat] = +(currentMultiplier + 0.1).toFixed(1); // 小数第1位まで
  localStorage.setItem("statusMultipliers", JSON.stringify(statusMultipliers));
  localStorage.setItem("gold", gold);
  logBattle(`${stat}の倍率を強化！ → x${statusMultipliers[stat].toFixed(1)}（残Gold: ${gold}）`);
}

function onEnemyDefeated() {
  if (currentEnemyIndex % 5 == 0) {
    savePoint = currentEnemyIndex; 
    localStorage.setItem("savePoint", savePoint);
    localStorage.setItem("gold", gold);
    localStorage.setItem("statusMultipliers", JSON.stringify(statusMultipliers));
    logBattle(`💾 セーブポイント更新！ (ステージ${savePoint})`);
  }
}

function onPlayerDeath() {
  logBattle("あなたは倒れてしまった…ゴールドの半分を失った");
  // ボタンを無効化
  document.getElementById("attackBtn").disabled = true;
  // 少し遅らせて開始画面に戻す
  setTimeout(() => {
    alert("ゲームオーバー！ 開始画面に戻ります");

  // ゲーム画面を隠す
  document.getElementById("gameArea").style.display = "none";
  document.getElementById("battleArea").style.display = "none";

  document.getElementById("startGameBtn").disabled = false;
  // 記録画面（開始画面）を表示    
  gold = gold /2 ;
  playerHP = calculateStatus().HP;
  playerMP = calculateStatus().MP;
  document.getElementById("gameArea").style.display = "block";
  }, 100);

}

resetProgress.onclick = () => {
  gold = 0;
  savePoint = 0;
  localStorage.removeItem("savePoint");

  statusMultipliers = {
    HP: 1,
    MP: 1,
    ATK: 1,
    DEF: 1,
    SPD: 1
  };
  localStorage.setItem("statusMultipliers", JSON.stringify(statusMultipliers));

  setTimeout(() => {
    alert("進行状況をリセットしました！");

    document.getElementById("battleArea").style.display = "none";

    gameMenu.style.display = "none";
    assignCategoryArea.style.display = "none"; // 割り当て画面も同時に非表示
    
    menuBtn.style.display = "inline-block"; // メニュー再表示
    document.getElementById("startGameBtn").disabled = false;
    // 記録画面（開始画面）を表示    
    document.getElementById("gameArea").style.display = "block";
  }, 100);
}

function healWithMP() {
  const healCost = 3;       // MP消費量
  const healAmount = 15;    // 回復量

  if (playerMP < healCost) {
    logBattle("MPが足りません！");
    return;
  }

  playerMP -= healCost;
  playerHP = Math.min(playerHP + healAmount, calculateStatus().HP); // 最大HPを超えないように
  logBattle(`MPを${healCost}消費してHPを${healAmount}回復！`);
  logBattle(`残りあなたのHP: ${playerHP}  残りあなたのMP: ${playerMP}`);
}

function heal() {
  const status = calculateStatus();

  // 先攻はSPDが高い方
  const playerSPD = status.SPD || 5;
  let playerFirst = playerSPD >= enemy.SPD;

  function enemyAttack() {
    let damage = Math.max(1, enemy.ATK - status.DEF);
    playerHP -= damage;
    logBattle(`${enemy.name}の攻撃！${damage}のダメージ！ 残りあなたのHP: ${playerHP}  残りあなたのMP: ${playerMP}`);
  }

  if (playerFirst) {
    healWithMP();
    if (enemyHP > 0) enemyAttack();
  } else {
    enemyAttack();
    if (playerHP > 0) healWithMP();
  }

  if (playerHP <= 0) {
    onPlayerDeath();
    return;
  }
}

function showStatUpgrade() {
  const area = document.getElementById("statUpgradeArea");
  area.style.display = "block";

  // 中身が空ならボタン群を追加（初回のみ）
  if (!area.innerHTML.trim()) {
    area.innerHTML = `
      <button class="small-button" onclick="upgradeStat('ATK')">ATK強化</button><br>
      <button class="small-button" onclick="upgradeStat('DEF')">DEF強化</button><br>
      <button class="small-button" onclick="upgradeStat('HP')">HP強化</button><br>
      <button class="small-button" onclick="upgradeStat('MP')">MP強化</button><br>
      <button class="small-button" onclick="upgradeStat('SPD')">SPD強化</button>
    `;
  }
}

let chart;

function updateChart() {
  const ctx = document.getElementById("radarChart").getContext("2d");
  const labels = categories;
  // Ensure numeric values and handle different shapes for pastScores
  const values = labels.map((l) => Number(scores[l] || 0));

  // pastScores may be stored as a flat map {cat: val} or a nested map {date: {cat:val}}
  function getPastVal(label) {
    if (!pastScores) return 0;
    // direct match
    if (pastScores[label] !== undefined) return Number(pastScores[label]) || 0;
    // if pastScores looks like { "2025-10-12": { cat: val, ... } }, try to find category inside
    const keys = Object.keys(pastScores);
    for (const k of keys) {
      const v = pastScores[k];
      if (v && typeof v === 'object' && v[label] !== undefined) return Number(v[label]) || 0;
    }
    return 0;
  }

  let pastValues = labels.map((l) => getPastVal(l));

  // フォールバック：pastScores が空の場合は「1週間前の状態」を計算する。
  // 方法: 今のスコアから「今週の増分」を引くことで、週の最初（=一つ前の週の状態）を得る。
  const hasPast = Object.keys(pastScores || {}).length > 0;
  if (!hasPast) {
    // 今週の増分を dailyLog から集計
    const thisWeek = getCurrentWeek();
    const thisWeekAgg = {};
    for (const [dateStr, entry] of Object.entries(dailyLog || {})) {
      try {
        const dt = new Date(dateStr);
        const w = getWeekNumberForDate(dt);
        if (w === thisWeek) {
          for (const [cat, val] of Object.entries(entry || {})) {
            thisWeekAgg[cat] = (thisWeekAgg[cat] || 0) + Number(val || 0);
          }
        }
      } catch (e) {
        // invalid date - ignore
      }
    }

    // 1週間前の状態 = 現在のスコア - 今週の増分
    const oneWeekAgo = {};
    for (const l of labels) {
      const curr = Number(scores[l] || 0);
      const delta = Number(thisWeekAgg[l] || 0);
      oneWeekAgo[l] = Math.max(0, curr - delta);
    }

    pastValues = labels.map((l) => oneWeekAgo[l]);
  }

  // diagnostic logging to help debug pastValues / pastScores
  try {
    console.debug('updateChart: labels=', labels);
    console.debug('updateChart: values=', values);
    console.debug('updateChart: pastScores (raw)=', pastScores);
    console.debug('updateChart: pastValues=', pastValues);
  } catch (e) { /* ignore logging errors */ }

  if (chart) chart.destroy();

  // Draw previous-week dataset first (underneath) so current-week stands out.
  chart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '先週',
          data: pastValues,
          backgroundColor: 'rgba(128,128,128,0.25)',
          borderColor: '#666',
          pointBackgroundColor: '#666'
        },
        {
          label: '今週',
          data: values,
          backgroundColor: 'rgba(0,128,255,0.28)',
          borderColor: 'blue',
          pointBackgroundColor: 'blue'
        }
      ]
    },
    options: {
      // Let Chart.js respond to the canvas/container size and keep a square aspect
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      scales: {
        r: {
          beginAtZero: true,
          suggestedMax: 10
        }
      }
    }
  });

  // If pastValues are all zero, warn in console to help debugging
  try {
    const allZero = pastValues.every(v => Number(v) === 0);
    if (allZero) console.info('updateChart: pastValues appear to be all zero — check pastScores/localStorage/dailyLog');
  } catch (e) { /* ignore */ }
}

checkWeekRollover();
checkWeekRollover();
render();
updateChart();


/*
ゲームで進むことができた最高到達点を記録、表示したい
目標ポイントで、ステータスに割り当てたカテゴリを、


*/

// ----------------------
// ドロワー（ポモドーロ設定）
// ----------------------
document.addEventListener('DOMContentLoaded', () => {
  const drawerBtn = document.getElementById('drawerBtn');
  const drawer = document.getElementById('drawer');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const saveBtn = document.getElementById('savePomodoroBtn');
  const resetBtn = document.getElementById('resetPomodoroBtn');

  const inpWork = document.getElementById('pomodoroWork');
  const inpBreak = document.getElementById('pomodoroBreak');
  const inpLong = document.getElementById('pomodoroLong');

  function openDrawer() {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    // 現在値を反映（入力要素がある場合のみ）
    try {
      if (inpWork) inpWork.value = pomodoro.work;
      if (inpBreak) inpBreak.value = pomodoro.break;
      if (inpLong) inpLong.value = pomodoro.long;
    } catch (e) { /* ignore */ }
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  // トグル機能: 外側ボタンを同じ位置で開閉に使う
  function toggleDrawer() {
    if (!drawer) return;
    if (drawer.classList.contains('open')) {
      // 閉じる
      closeDrawer();
      if (drawerBtn) {
        drawerBtn.textContent = '☰';
        drawerBtn.setAttribute('aria-expanded', 'false');
      }
      if (closeDrawerBtn) closeDrawerBtn.style.display = '';
    } else {
      // 開く
      openDrawer();
      if (drawerBtn) {
        drawerBtn.textContent = '✕';
        drawerBtn.setAttribute('aria-expanded', 'true');
      }
      if (closeDrawerBtn) closeDrawerBtn.style.display = '';
    }
  }

  if (drawerBtn) drawerBtn.addEventListener('click', toggleDrawer);
  if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', () => {
    closeDrawer();
    if (drawerBtn) {
      drawerBtn.textContent = '☰';
      drawerBtn.setAttribute('aria-expanded', 'false');
    }
    if (closeDrawerBtn) closeDrawerBtn.style.display = '';
  });

  if (saveBtn) saveBtn.addEventListener('click', () => {
    pomodoro.work = Math.max(1, Number(inpWork.value) || 25);
    pomodoro.break = Math.max(1, Number(inpBreak.value) || 5);
    pomodoro.long = Math.max(1, Number(inpLong.value) || 15);
    localStorage.setItem('pomodoro', JSON.stringify(pomodoro));
    alert('ポモドーロ設定を保存しました');
    closeDrawer();
  });

  if (resetBtn) resetBtn.addEventListener('click', () => {
    pomodoro = { work: 25, break: 5, long: 15 };
    localStorage.setItem('pomodoro', JSON.stringify(pomodoro));
    inpWork.value = pomodoro.work;
    inpBreak.value = pomodoro.break;
    inpLong.value = pomodoro.long;
    alert('デフォルトにリセットしました');
  });
  // restore active pomodoro if any (persisted across page reloads)
  try {
    const saved = restoreActivePomodoroFromStorage();
    if (saved) {
      // rehydrate
      pomodoroState = saved;
      if (pomodoroState.endTS) pomodoroState.endTS = Number(pomodoroState.endTS);

      // show overlay and apply phase styling
      showFixedPomodoroOverlay(pomodoroState.cat);
      const modal = document.querySelector('#pomodoroOverlay .modal');
      if (modal) {
        modal.classList.remove('phase-five','phase-break');
        modal.classList.add('phase-' + (pomodoroState.phase || 'five'));
      }

      // adjust close button label/state
      const closeBtn = document.getElementById('pomodoroClose');
      if (closeBtn) closeBtn.textContent = '中断';

      // start ticking unless paused
      if (pomodoroTimer) clearInterval(pomodoroTimer);
      pomodoroTimer = setInterval(() => tickFixedPomodoro(), 1000);
      tickFixedPomodoro();
      // re-schedule notifications for this state (best-effort)
      try { schedulePomodoroNotifications(pomodoroState); } catch (e) { /* ignore */ }
    }
  } catch (e) { console.warn('restore active pomodoro failed', e); }

    // Birthday & Deadline UI hookup (in drawer)
    try {
      const birthdayInp = document.getElementById('birthdayInput');
      const saveBirthdayBtn = document.getElementById('saveBirthdayBtn');
      const deadlineInp = document.getElementById('deadlineInput');
      if (birthdayInp) {
        birthdayInp.value = localStorage.getItem('birthday') || '';
        birthdayInp.addEventListener('change', saveBirthdayFromInput);
      }
      if (deadlineInp) {
        deadlineInp.value = localStorage.getItem('deadline') || '';
        deadlineInp.addEventListener('change', saveBirthdayFromInput);
      }
      if (saveBirthdayBtn) saveBirthdayBtn.addEventListener('click', saveBirthdayFromInput);
      // initial render
      updateRemainingWeeks();
      // Ensure daily pomodoro counter date is initialized/reset on load
      try { ensurePomodoroDailyCounter(); } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
});

// ----------------------
// カテゴリ単位のポモドーロ処理
// ----------------------
let pomodoroTimer = null;
let pomodoroState = null; // { cat, phase: 'work'|'break', remaining }

// 保存/復元用キー
const ACTIVE_POMODORO_KEY = 'activePomodoro';

function persistActivePomodoro() {
  try {
    if (!pomodoroState) {
      localStorage.removeItem(ACTIVE_POMODORO_KEY);
      return;
    }
    const copy = { ...pomodoroState };
    // Date を number に
    if (copy.startTS instanceof Date) copy.startTS = copy.startTS.valueOf();
    if (copy.endTS instanceof Date) copy.endTS = copy.endTS.valueOf();
    localStorage.setItem(ACTIVE_POMODORO_KEY, JSON.stringify(copy));
    // Try to schedule notifications for important transitions (best-effort)
    try {
      schedulePomodoroNotifications(copy);
    } catch (e) { /* ignore scheduling errors */ }
  } catch (e) { console.warn('persistActivePomodoro failed', e); }
}

function clearActivePomodoroStorage() {
  localStorage.removeItem(ACTIVE_POMODORO_KEY);
}

function restoreActivePomodoroFromStorage() {
  try {
    const raw = localStorage.getItem(ACTIVE_POMODORO_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    // ensure numeric fields
    if (obj) {
      if (obj.startTS) obj.startTS = Number(obj.startTS);
      if (obj.endTS) obj.endTS = Numb
      er(obj.endTS);
      return obj;
    }
  } catch (e) {
    console.warn('restoreActivePomodoroFromStorage failed', e);
  }
  return null;
}

// Attempt to schedule notifications for pomodoro events (best-effort).
// Uses Service Worker Notification Triggers API if available. Falls back to requesting
// permission and doing nothing if scheduling isn't supported.
function schedulePomodoroNotifications(state) {
  if (!state) return;
  // Only schedule notifications for future events we care about:
  // - end of work phase
  // - end of break phase
  try {
    ensureNotificationPermission().then((granted) => {
      if (!granted) return;
      // get service worker registration if available
      if (!('serviceWorker' in navigator)) return;
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        // helper to attempt schedule via showNotification + TimestampTrigger
        const trySchedule = (ts, title, body, tag) => {
          if (!ts || ts <= Date.now()) return;
          try {
            // Feature detect: TimestampTrigger (Notification Triggers API)
            if (typeof TimestampTrigger !== 'undefined') {
              reg.showNotification(title, {
                body: body,
                tag: tag,
                renotify: true,
                showTrigger: new TimestampTrigger(ts)
              }).catch((e) => {
                // quietly ignore if not supported in this browser build
                console.warn('showNotification with showTrigger failed', e);
              });
              return;
            }
          } catch (e) {
            // ignore
          }

          // If TimestampTrigger not available, we cannot reliably schedule when the
          // page is closed. As a fallback, if page is still open we can set a timeout
          // (this helps only when app in background but not closed). Also, if the
          // time until the event is short, we attempt setTimeout as a best-effort.
          const delta = ts - Date.now();
          if (delta > 0 && delta <= 24 * 3600 * 1000) { // only schedule short timeouts (<=24h)
            setTimeout(() => {
              reg.showNotification(title, { body: body, tag: tag, renotify: true });
            }, delta);
          }
        };

        // schedule based on state phase
        if (state.phase === 'work' && state.endTS) {
          trySchedule(Number(state.endTS), '作業終了', `${state.cat} の25分作業が終了しました。休憩に移ります。`, 'pomodoro-work-' + (state.cat || ''));
        }
        if (state.phase === 'break' && state.endTS) {
          trySchedule(Number(state.endTS), '休憩終了', `${state.cat} の休憩が終了しました。`, 'pomodoro-break-' + (state.cat || ''));
        }
      }).catch((e) => { console.warn('getRegistration failed', e); });
    });
  } catch (e) {
    console.warn('schedulePomodoroNotifications error', e);
  }
}

// Convenience helper to schedule break-end notification when transitioning to break
function scheduleBreakEndNotification(endTS, cat) {
  try {
    schedulePomodoroNotifications({ phase: 'break', endTS: endTS, cat: cat });
  } catch (e) { /* ignore */ }
}

// ----------------------
// 誕生日 / 残り週間表示
// ----------------------
function updateRemainingWeeks() {
  const dob = localStorage.getItem('birthday');
  // If birthday not set, update drawer display if present and exit
  if (!dob) {
    const drawerDisplay = document.getElementById('remainingWeeksDisplay');
    if (drawerDisplay) drawerDisplay.textContent = '誕生日が未設定です';
    return;
  }
  const b = new Date(dob);
  if (isNaN(b)) {
    const drawerDisplayErr = document.getElementById('remainingWeeksDisplay');
    if (drawerDisplayErr) drawerDisplayErr.textContent = '無効な日付です';
    return;
  }
  // Determine end date: prefer explicit deadline (date), otherwise fall back to stored life-expectancy years
  const deadlineStr = localStorage.getItem('deadline');
  let end = null;
  if (deadlineStr) {
    const d = new Date(deadlineStr);
    if (!isNaN(d)) end = d;
  }
  const storedLife = Number(localStorage.getItem('lifeExpectancy')) || 80;
  if (!end) {
    end = new Date(b);
    end.setFullYear(end.getFullYear() + storedLife);
  }
  const now = new Date();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  let weeksLeft = Math.floor((end - now) / msPerWeek);
  if (weeksLeft < 0) weeksLeft = 0;
  const totalWeeks = Math.max(1, Math.floor((end - b) / msPerWeek));
  const weeksLived = Math.max(0, totalWeeks - weeksLeft);
  const pct = Math.round((weeksLived / totalWeeks) * 100);
  // update drawer textual display (actual remaining) if present
  const drawerDisplay = document.getElementById('remainingWeeksDisplay');
  if (drawerDisplay) drawerDisplay.innerHTML = `残り週: <strong>${weeksLeft}</strong> 週 （経過 ${weeksLived}/${totalWeeks} 週・${pct}%）`;

   // Update the new top-area remainingContainer with weeks/days/hours
  try { renderRemainingContainer(end); } catch (e) { /* ignore */ }
}

// Render remainingContainer: remaining weeks, days, hours to 'end' date (or show unset)
// Interval id to update the remaining container every second
let __remainingContainerIntervalId = null;

function renderRemainingContainer(endDate) {
  const container = document.getElementById('remainingContainer');
  if (!container) return;

  // resolve end date (deadline preferred, then birthday+lifeExpectancy)
  function resolveEnd(dArg) {
    try {
      if (dArg instanceof Date && !isNaN(dArg)) return dArg;
      if (typeof dArg === 'number') return new Date(dArg);
    } catch (e) {}
    const deadlineStr = localStorage.getItem('deadline');
    if (deadlineStr) {
      const d = new Date(deadlineStr);
      if (!isNaN(d)) return d;
    }
    const dob = localStorage.getItem('birthday');
    if (dob) {
      const b = new Date(dob);
      if (!isNaN(b)) {
        const storedLife = Number(localStorage.getItem('lifeExpectancy')) || 80;
        const e = new Date(b);
        e.setFullYear(e.getFullYear() + storedLife);
        return e;
      }
    }
    return null;
  }

  const end = resolveEnd(endDate);

  // internal update function (called every second)
  function doUpdate() {
    if (!container) return;
    let html = '';
    if (!end) {
      html = '<div style="font-size:14px;color:#555">デッドライン未設定</div>';
      container.innerHTML = html;
      return;
    }

    const now = new Date();
    let deltaMs = end - now;
    if (deltaMs < 0) deltaMs = 0;

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const msPerDay = 24 * 60 * 60 * 1000;

    // Remaining full weeks
    const weeks = Math.floor(deltaMs / msPerWeek);
    // Remaining full days (after removing full weeks)
    const days = Math.floor((deltaMs % msPerWeek) / msPerDay);

    // For hh:mm:ss, use total hours (floor of total seconds / 3600), then minutes & seconds
    const totalSeconds = Math.floor(deltaMs / 1000);
    const totalHours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hh = String(totalHours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    html += `<div style="font-size:14px;color:#222">残り ${weeks} 週</div>`;
    html += `<div style="font-size:14px;color:#222">残り ${days} 日</div>`;
    html += `<div style="font-size:16px;color:#111;font-weight:600">残り ${hh}:${mm}:${ss}</div>`;

    container.innerHTML = html;
  }

  // Set up interval to update every second. Clear previous if present.
  if (__remainingContainerIntervalId) {
    clearInterval(__remainingContainerIntervalId);
    __remainingContainerIntervalId = null;
  }
  doUpdate();
  __remainingContainerIntervalId = setInterval(doUpdate, 1000);
}

function saveBirthdayFromInput() {
  const inp = document.getElementById('birthdayInput');
  if (!inp) return;
  const v = inp.value;
  if (!v) {
    localStorage.removeItem('birthday');
  } else {
    localStorage.setItem('birthday', v);
  }
  // also save life expectancy if provided
  const lifeInp = document.getElementById('lifeExpectancyInput');
  if (lifeInp) {
    const lv = Number(lifeInp.value);
    if (isFinite(lv) && lv > 0) {
      localStorage.setItem('lifeExpectancy', String(Math.floor(lv)));
    } else {
      localStorage.removeItem('lifeExpectancy');
    }
  }
  // save deadline date input if present (new: デッドライン)
  const deadlineInp = document.getElementById('deadlineInput');
  if (deadlineInp) {
    const dv = deadlineInp.value;
    if (!dv) {
      localStorage.removeItem('deadline');
    } else {
      // store as ISO date string
      localStorage.setItem('deadline', dv);
    }
  }
  updateRemainingWeeks();
}

function startPomodoroForCategory(cat, pOption) {
  if (pomodoroTimer) return alert('既にタイマーが動作中です');
  // pOption 優先、未指定なら保存されている設定を読み込む
  let p;
  if (pOption && typeof pOption === 'object') {
    p = {
      work: Number(pOption.work) || (pomodoro.work || 25),
      break: Number(pOption.break) || (pomodoro.break || 5),
    };
  } else {
    p = JSON.parse(localStorage.getItem('pomodoro')) || pomodoro;
  }
  showGlobalTimerUI(cat, p, pOption && pOption.pointsToGrant ? pOption.pointsToGrant : 1);
}

// ＋ボタン押下時: 25分作業 -> 休憩(通常5分 / 4回ごと30分)
function startFiveMinutePomodoro(cat) {
  if (pomodoroTimer) return alert('既にタイマーが動作中です');

  const dailyCount = ensurePomodoroDailyCounter();
  const nextRunNumber = dailyCount + 1;
  const breakMinutes = (nextRunNumber % 4 === 0) ? 30 : 5;

  // setup state
  const now = Date.now();
  pomodoroState = {
    cat,
    phase: 'work', // 'work' | 'break'
    endTS: now + 25 * 60 * 1000,
    breakMinutes,
    runNumber: nextRunNumber,
  };

  // persist immediately so reloads can restore
  persistActivePomodoro();

  // show overlay and start ticking
  showFixedPomodoroOverlay(cat);
  if (pomodoroTimer) clearInterval(pomodoroTimer);
  pomodoroTimer = setInterval(() => tickFixedPomodoro(), 1000);
  tickFixedPomodoro();
}

function tickFixedPomodoro() {
  if (!pomodoroState) return;
  const now = Date.now();
  const clock = document.getElementById('pomodoroClock');
  const closeBtn = document.getElementById('pomodoroClose');

  if (pomodoroState.phase === 'work') {
    let remaining = Math.ceil((pomodoroState.endTS - now) / 1000);
    if (remaining < 0) remaining = 0;
    const mm = Math.floor(remaining / 60);
    const ss = remaining % 60;
    if (clock) clock.textContent = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    if (remaining <= 0) {
      playBeep();
      sendNotification('作業終了', `${pomodoroState.cat} の25分作業が終了しました。休憩を開始します。`);
      pomodoroState.phase = 'break';
      const breakSec = (Number(pomodoroState.breakMinutes) || 5) * 60;
      pomodoroState.endTS = Date.now() + breakSec * 1000;

      if (closeBtn) closeBtn.textContent = '中断';
      const modal = document.querySelector('#pomodoroOverlay .modal');
      if (modal) {
        modal.classList.remove('phase-five');
        modal.classList.add('phase-break');
      }

      persistActivePomodoro();
    }
    return;
  }

  if (pomodoroState.phase === 'break') {
    let remaining = Math.ceil((pomodoroState.endTS - now) / 1000);
    if (remaining < 0) remaining = 0;
    const mm = Math.floor(remaining / 60);
    const ss = remaining % 60;
    if (clock) clock.textContent = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    if (remaining <= 0) {
      playBeep();
      sendNotification('休憩終了', `${pomodoroState.cat} の休憩が終了しました。`);
      // count one completed pomodoro at the end of break
      incrementPomodoroDailyCounter();
      clearInterval(pomodoroTimer);
      pomodoroTimer = null;
      pomodoroState = null;
      // ensure persisted state is cleared
      clearActivePomodoroStorage();
      // cleanup overlay and styles
      const modal = document.querySelector('#pomodoroOverlay .modal');
      if (modal) {
        modal.classList.remove('phase-break');
      }
      hideOverlay();
      render();
    }
    return;
  }
}

function showFixedPomodoroOverlay(cat) {
  // prevent duplicate
  if (document.getElementById('pomodoroOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'pomodoroOverlay';
  overlay.className = 'overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  // initial phase class for coloring
  modal.classList.add('phase-five');
  modal.innerHTML = `
    <div class="pomodoro-timer global">
      <div class="pomodoro-clock" id="pomodoroClock">25:00</div>
      <div class="pomodoro-controls">
        <button id="pomodoroClose">中断</button>
      </div>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const closeBtn = document.getElementById('pomodoroClose');
  if (closeBtn) {
    closeBtn.focus();
    closeBtn.onclick = () => {
      if (!pomodoroState) return hideOverlay();
      clearInterval(pomodoroTimer);
      pomodoroTimer = null;
      pomodoroState = null;
      clearActivePomodoroStorage();
      hideOverlay();
      render();
    };
  }

  // block Esc and non-intended key actions while overlay present
  window.addEventListener('keydown', blockKeydown, true);
}

function showGlobalTimerUI(cat, p, pointsToGrant = 1) {
  const list = document.getElementById('categoryList');
  if (!list) return alert('カテゴリ一覧が見つかりません');

  // 保存しておく（復元用）
  list.dataset._original = list.innerHTML;

  // オーバーレイを表示（これで他操作を遮断）
  showOverlay(cat);

  // チャートを暗く（補助）
  const topArea = document.querySelector('.top');
  if (topArea) topArea.classList.add('dimmed');

  // 初期状態
  const workSec = (Number(p.work) || 25) * 60;
  const breakSec = (Number(p.break) || 5) * 60;
  const now = Date.now();
  pomodoroState = {
    cat,
    phase: 'work',
    remaining: workSec,
    workSec: workSec,
    breakSec: breakSec,
    pointsToGrant: Number(pointsToGrant) || 1,
    paused: false,
    startTS: now,
    endTS: now + workSec * 1000
  };
  persistActivePomodoro();

  // start ticking
  if (pomodoroTimer) clearInterval(pomodoroTimer);
  pomodoroTimer = setInterval(() => tickGlobalTimer(), 1000);
  tickGlobalTimer();
}

function tickGlobalTimer() {
  if (!pomodoroState) return;
  if (pomodoroState.paused) return; // paused -> do nothing

  const now = Date.now();
  let remainingSec = Math.ceil((pomodoroState.endTS - now) / 1000);
  // clamp
  if (remainingSec < 0) remainingSec = 0;

  const min = Math.floor(remainingSec / 60);
  const sec = remainingSec % 60;
  const clock = document.getElementById('pomodoroClock');
  if (clock) clock.textContent = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;

  // phase transition
  if (remainingSec <= 0) {
    if (pomodoroState.phase === 'work') {
      playBeep();
      pomodoroState.phase = 'break';
      // set next endTS based on breakSec
      pomodoroState.startTS = now;
      pomodoroState.endTS = now + pomodoroState.breakSec * 1000;
        // schedule a notification for break end (best-effort)
        try { scheduleBreakEndNotification(pomodoroState.endTS, pomodoroState.cat); } catch (e) { /* ignore */ }
      logBattle(`${pomodoroState.cat} の作業が終了しました。休憩に入ります。`);
      // Notification
      sendNotification('作業終了', `${pomodoroState.cat} の作業が終了しました。休憩に入ります。`);
      persistActivePomodoro();
    } else {
      // break finished
      playBeep();
      // Notification
      sendNotification('休憩終了', `${pomodoroState.cat} の休憩が終了しました。お疲れさま！`);
      clearInterval(pomodoroTimer);
      pomodoroTimer = null;
      logBattle(`${pomodoroState.cat} のポモドーロが完了しました！`);
      const completedCat = pomodoroState.cat;
      const pts = pomodoroState.pointsToGrant || 1;
      pomodoroState = null;
      clearActivePomodoroStorage();
      closeGlobalTimerUI(true, completedCat, pts);
    }
  }
}

function closeGlobalTimerUI(grantPoint, completedCat, points=1) {
  const list = document.getElementById('categoryList');
  if (!list) return;
  // チャートのダーク解除
  const topArea = document.querySelector('.top');
  if (topArea) topArea.classList.remove('dimmed');

  // 元の内容に戻す
  const orig = list.dataset._original;
  if (orig !== undefined) {
    list.innerHTML = orig;
    delete list.dataset._original;
  }

  // ポイント付与
  if (grantPoint && completedCat) {
    updateScore(completedCat, Number(points) || 1);
  } else {
    render();
  }
  hideOverlay();
}

// overlay: 全画面を覆う modal を作成/破棄する
function showOverlay(cat) {
  // prevent duplicate
  if (document.getElementById('pomodoroOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'pomodoroOverlay';
  overlay.className = 'overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="pomodoro-timer global">
      <div class="pomodoro-clock" id="pomodoroClock">--:--</div>
      <div class="pomodoro-controls">
        <button id="pomodoroPause">一時停止</button>
        <button id="pomodoroClose">中断</button>
      </div>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // focus trap & button handlers
  const pauseBtn = document.getElementById('pomodoroPause');
  const closeBtn2 = document.getElementById('pomodoroClose');
  if (pauseBtn) {
    pauseBtn.focus();
    pauseBtn.onclick = () => {
      if (!pomodoroState) return;
      if (!pomodoroState.paused) {
        // pause: compute remaining and persist
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((pomodoroState.endTS - now) / 1000));
        pomodoroState.paused = true;
        pomodoroState.remainingSeconds = remaining;
        clearInterval(pomodoroTimer);
        pomodoroTimer = null;
        pauseBtn.textContent = '再開';
        persistActivePomodoro();
      } else {
        // resume
        pomodoroState.paused = false;
        const rem = Number(pomodoroState.remainingSeconds || 0);
        pomodoroState.startTS = Date.now();
        pomodoroState.endTS = Date.now() + rem * 1000;
        delete pomodoroState.remainingSeconds;
        if (pomodoroTimer) clearInterval(pomodoroTimer);
        pomodoroTimer = setInterval(() => tickGlobalTimer(), 1000);
        pauseBtn.textContent = '一時停止';
        persistActivePomodoro();
      }
    };
  }
  if (closeBtn2) {
    closeBtn2.onclick = () => {
      const completedWork = pomodoroState && pomodoroState.phase === 'work' && (pomodoroState.remaining <= 0 || false);
      clearInterval(pomodoroTimer);
      pomodoroTimer = null;
      // clear persisted state since user aborted
      clearActivePomodoroStorage();
      hideOverlay();
      closeGlobalTimerUI(completedWork);
    };
  }

  // ブラウザの Esc で閉じさせない（無効化）
  window.addEventListener('keydown', blockKeydown, true);
}

function hideOverlay() {
  const overlay = document.getElementById('pomodoroOverlay');
  if (overlay) overlay.remove();
  window.removeEventListener('keydown', blockKeydown, true);
}

function blockKeydown(e) {
  // Tab をループさせるなどの複雑な処理はここでは簡易的にブロック
  // ただし Enter や Space はボタン操作で使いたいのでそれらは許可
  if (e.key === 'Escape') {
    e.stopImmediatePropagation();
    e.preventDefault();
    return false;
  }
  // タイマー以外のキーボード操作を禁止
  if (e.target && !document.getElementById('pomodoroOverlay')) return;
  // allow Enter/Space for buttons inside overlay
  const allowed = ['Enter', ' ', 'Spacebar'];
  if (allowed.includes(e.key)) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  return false;
}

// シンプルな beep を鳴らす（WebAudio API）
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    o.start();
    setTimeout(() => {
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      o.stop(ctx.currentTime + 0.25);
      ctx.close();
    }, 250);
  } catch (e) {
    console.warn('Audio not available', e);
  }
}

// Notification API helper
function ensureNotificationPermission() {
  try {
    if (!('Notification' in window)) return Promise.resolve(false);
    if (Notification.permission === 'granted') return Promise.resolve(true);
    if (Notification.permission !== 'denied') {
      return Notification.requestPermission().then(p => p === 'granted');
    }
    return Promise.resolve(false);
  } catch (e) { return Promise.resolve(false); }
}

function sendNotification(title, body) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else {
      // try to request and then send
      ensureNotificationPermission().then(ok => { if (ok) new Notification(title, { body }); });
    }
  } catch (e) {
    console.warn('Notification failed', e);
  }
}

// Fallback global drawer open/close helpers in case DOM-scoped handlers fail
function openDrawerGlobal() {
  const drawer = document.getElementById('drawer');
  const drawerBtn = document.getElementById('drawerBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  if (!drawer) return;
  // ensure no inline transform blocks the CSS rule
  drawer.style.transform = '';
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  if (drawerBtn) {
    drawerBtn.textContent = '✕';
    drawerBtn.setAttribute('aria-expanded', 'true');
  }
  if (closeDrawerBtn) closeDrawerBtn.style.display = '';
}

function closeDrawerGlobal() {
  const drawer = document.getElementById('drawer');
  const drawerBtn = document.getElementById('drawerBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  if (!drawer) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  // If any element inside the drawer still has focus, blur it to avoid
  // aria-hidden on a focused element (accessibility issue).
  try {
    const active = document.activeElement;
    if (active && drawer.contains(active)) {
      // blur focused element inside drawer
      if (typeof active.blur === 'function') active.blur();
      // move focus to drawer button for accessibility
      const db = document.getElementById('drawerBtn');
      if (db) db.focus();
    }
  } catch (e) { /* ignore */ }
  // remove any inline transform so CSS rules govern appearance
  try { drawer.style.transform = ''; } catch (e) { /* ignore */ }
  if (drawerBtn) {
    drawerBtn.textContent = '☰';
    drawerBtn.setAttribute('aria-expanded', 'false');
  }
  if (closeDrawerBtn) closeDrawerBtn.style.display = '';
}

// Document-level delegation to ensure clicks on either button always work
document.addEventListener('click', (e) => {
  const dBtn = e.target.closest && e.target.closest('#drawerBtn');
  const cBtn = e.target.closest && e.target.closest('#closeDrawerBtn');
  if (dBtn) {
    const drawer = document.getElementById('drawer');
    if (drawer && drawer.classList.contains('open')) {
      closeDrawerGlobal();
    } else {
      openDrawerGlobal();
    }
    e.stopPropagation();
    return;
  }
  if (cBtn) {
    closeDrawerGlobal();
    e.stopPropagation();
    return;
  }
});

// Ensure drawer is closed on load and attach direct handlers as a fallback
function initDrawerControls() {
  try {
    const drawer = document.getElementById('drawer');
    const drawerBtn = document.getElementById('drawerBtn');
    const closeDrawerBtn = document.getElementById('closeDrawerBtn');
    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      // do NOT set inline transform here — let CSS handle the hidden state via class
    }

    if (drawerBtn) {
      // remove existing handlers we may have added before to avoid duplication
      drawerBtn.replaceWith(drawerBtn.cloneNode(true));
      const newBtn = document.getElementById('drawerBtn') || document.querySelector('#drawerBtn');
      if (newBtn) newBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const d = document.getElementById('drawer');
        if (!d) return;
        if (d.classList.contains('open')) closeDrawerGlobal(); else openDrawerGlobal();
      });
    }

    if (closeDrawerBtn) {
      closeDrawerBtn.replaceWith(closeDrawerBtn.cloneNode(true));
      const newClose = document.getElementById('closeDrawerBtn') || document.querySelector('#closeDrawerBtn');
      if (newClose) newClose.addEventListener('click', (ev) => { ev.stopPropagation(); closeDrawerGlobal(); });
    }
  } catch (e) { console.warn('drawer init failed', e); }
}

// call immediately and also on DOMContentLoaded as fallback
initDrawerControls();
document.addEventListener('DOMContentLoaded', initDrawerControls);
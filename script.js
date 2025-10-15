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

function getCurrentWeek() {
  const date = new Date();
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7; // 月曜始まりに変換（0=月曜）
  target.setDate(target.getDate() - dayNr + 3); // 木曜基準に調整

  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const weekNumber = Math.ceil(((target - firstThursday) / 86400000 + 1) / 7);
  return weekNumber;
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
  plus.onclick = () => startPomodoroForCategory(cat);

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

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "今週",
          data: values,
          backgroundColor: "rgba(0, 128, 255, 0.2)",
          borderColor: "blue",
        },
        {
          label: "先週",
          data: pastValues,
          backgroundColor: "rgba(128, 128, 128, 0.1)",
          borderColor: "gray",
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          suggestedMax: 10,
        },
      },
    },
  });
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
    // 現在値を反映
    inpWork.value = pomodoro.work;
    inpBreak.value = pomodoro.break;
    inpLong.value = pomodoro.long;
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
      if (closeDrawerBtn) closeDrawerBtn.style.display = 'none';
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
});

// ----------------------
// カテゴリ単位のポモドーロ処理
// ----------------------
let pomodoroTimer = null;
let pomodoroState = null; // { cat, phase: 'work'|'break', remaining }

function startPomodoroForCategory(cat) {
  if (pomodoroTimer) return alert('既にタイマーが動作中です');
  // 保存されている設定を読み込む
  const p = JSON.parse(localStorage.getItem('pomodoro')) || pomodoro;
  showGlobalTimerUI(cat, p);
}

function showGlobalTimerUI(cat, p) {
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
  pomodoroState = {
    cat,
    phase: 'work',
    remaining: (Number(p.work) || 25) * 60,
    workSec: (Number(p.work) || 25) * 60,
    breakSec: (Number(p.break) || 5) * 60
  };

  pomodoroTimer = setInterval(() => tickGlobalTimer(), 1000);
  tickGlobalTimer();
}

function tickGlobalTimer() {
  if (!pomodoroState) return;
  pomodoroState.remaining -= 1;
  const min = Math.floor(pomodoroState.remaining / 60);
  const sec = pomodoroState.remaining % 60;
  const clock = document.getElementById('pomodoroClock');
  if (clock) clock.textContent = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;

  if (pomodoroState.remaining <= 0) {
    if (pomodoroState.phase === 'work') {
      // work 終了 -> break に移行
      playBeep();
      pomodoroState.phase = 'break';
      pomodoroState.remaining = pomodoroState.breakSec;
      logBattle(`${pomodoroState.cat} の作業が終了しました。休憩に入ります。`);
    } else {
      // break 終了 -> セッション完了
      playBeep();
      clearInterval(pomodoroTimer);
      pomodoroTimer = null;
      logBattle(`${pomodoroState.cat} のポモドーロが完了しました！`);
      const completedCat = pomodoroState.cat;
      pomodoroState = null;
      closeGlobalTimerUI(true, completedCat);
    }
  }
}

function closeGlobalTimerUI(grantPoint, completedCat) {
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
    updateScore(completedCat, 1);
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
      if (!pomodoroTimer) {
        // resume
        pomodoroTimer = setInterval(() => tickGlobalTimer(), 1000);
        // update label
        pauseBtn.textContent = '一時停止';
      } else {
        // pause
        clearInterval(pomodoroTimer);
        pomodoroTimer = null;
        pauseBtn.textContent = '再開';
      }
    };
  }
  if (closeBtn2) {
    closeBtn2.onclick = () => {
      const completedWork = pomodoroState && pomodoroState.phase === 'work' && pomodoroState.remaining <= 0;
      clearInterval(pomodoroTimer);
      pomodoroTimer = null;
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
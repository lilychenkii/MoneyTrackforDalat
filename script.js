import { firebaseConfig } from "./firebaseconfig.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

(function () {
  "use strict";

  var DAYS = [1, 2, 3];
  var PEOPLE = [
    { key: "khanhly", name: "Khánh Ly" },
    { key: "minhphuong", name: "Minh Phương" }
  ];

  // ---------- Firebase setup ----------
  var app = initializeApp(firebaseConfig);
  var db = getFirestore(app);
  var docRef = doc(db, "tripTracker", "data");

  function emptyState() {
    return {
      budgets: { khanhly: 0, minhphuong: 0 },
      entries: { khanhly: [], minhphuong: [] }
    };
  }

  var state = emptyState();
  var domReady = false;
  var connEl = null; // trạng thái kết nối hiển thị cho người dùng

  function sanitizeState(raw) {
    var s = emptyState();
    if (raw && raw.budgets) {
      PEOPLE.forEach(function (p) {
        if (typeof raw.budgets[p.key] === "number") s.budgets[p.key] = raw.budgets[p.key];
      });
    }
    if (raw && raw.entries) {
      PEOPLE.forEach(function (p) {
        if (Array.isArray(raw.entries[p.key])) s.entries[p.key] = raw.entries[p.key];
      });
    }
    return s;
  }

  // Ghi dữ liệu lên Firestore (mọi thiết bị khác mở web sẽ tự cập nhật realtime)
  function saveData() {
    setDoc(docRef, state).catch(function (e) {
      console.error("Không lưu được dữ liệu lên Firebase.", e);
      setConnStatus("Lỗi lưu dữ liệu — kiểm tra mạng / Firestore Rules.", true);
    });
  }

  function setConnStatus(text, isError) {
    if (!connEl) return;
    connEl.textContent = text;
    connEl.classList.toggle("conn-error", !!isError);
  }

  // ---------- Helpers ----------
  function formatVND(n) {
    var v = Math.round(n || 0);
    return v.toLocaleString("vi-VN") + " \u20AB";
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function daySpent(personKey, day) {
    return state.entries[personKey]
      .filter(function (e) { return e.day === day; })
      .reduce(function (sum, e) { return sum + e.amount; }, 0);
  }

  function spentThroughDay(personKey, day) {
    return state.entries[personKey]
      .filter(function (e) { return e.day <= day; })
      .reduce(function (sum, e) { return sum + e.amount; }, 0);
  }

  function totalSpent(personKey) {
    return state.entries[personKey].reduce(function (sum, e) { return sum + e.amount; }, 0);
  }

  // ---------- Build DOM (chỉ dựng khung 1 lần) ----------
  var pagesEl = document.getElementById("pages");
  var personTpl = document.getElementById("personTemplate");
  var dayTpl = document.getElementById("dayTemplate");

  function buildPersonPage(person) {
    var frag = personTpl.content.cloneNode(true);
    var page = frag.querySelector(".page");
    page.setAttribute("data-person", person.key);

    // Set first person active by default
    if (person.key === "khanhly") {
      page.classList.add("active");
    }

    frag.querySelector(".person-name").textContent = person.name;
    frag.querySelector(".budget-name").textContent = person.name;

    var budgetInput = frag.querySelector(".budget-input");
    budgetInput.value = state.budgets[person.key] || "";

    var saveTimer = null;
    budgetInput.addEventListener("input", function () {
      var v = parseFloat(budgetInput.value);
      state.budgets[person.key] = isNaN(v) ? 0 : v;
      refreshTotals(person.key);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveData, 400); // debounce khi gõ số
    });

    var daysContainer = frag.querySelector(".days-container");
    DAYS.forEach(function (day) {
      daysContainer.appendChild(buildDayEntry(person, day));
    });

    // Handle Day tab switching inside this person page
    var dayTabBtns = frag.querySelectorAll(".day-tab-btn");
    dayTabBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var selectedDay = parseInt(btn.getAttribute("data-day-tab"));
        
        // Toggle active class on day tab buttons
        dayTabBtns.forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });

        // Toggle active class on day entries
        var dayEntries = daysContainer.querySelectorAll(".day-entry");
        dayEntries.forEach(function (entry) {
          var dayNum = parseInt(entry.getAttribute("data-day"));
          entry.classList.toggle("active", dayNum === selectedDay);
        });
      });
    });

    pagesEl.appendChild(frag);
  }

  function buildDayEntry(person, day) {
    var frag = dayTpl.content.cloneNode(true);
    var section = frag.querySelector(".day-entry");
    section.setAttribute("data-day", day);
    section.setAttribute("data-owner", person.key);

    // Set Day 1 active by default
    if (day === 1) {
      section.classList.add("active");
    }

    frag.querySelector(".day-num").textContent = "Ngày " + day;
    frag.querySelector(".day-label").textContent = day === 1 ? "(khởi hành)" : (day === 3 ? "(cuối)" : "");

    var catSelect = frag.querySelector(".cat-select");
    var otherField = frag.querySelector(".other-field");
    var otherInput = frag.querySelector(".other-input");
    var amountInput = frag.querySelector(".amount-input");
    var saveBtn = frag.querySelector(".save-btn");
    var errorEl = frag.querySelector(".form-error");

    saveBtn.addEventListener("click", function () {
      errorEl.hidden = true;
      var category = catSelect.value;
      var amount = parseFloat(amountInput.value);
      var desc = otherInput.value.trim();

      if (category === "Khác" && !desc) {
        errorEl.textContent = "Vui lòng nhập rõ khoản \u201Ckhác\u201D là gì.";
        errorEl.hidden = false;
        otherInput.focus();
        return;
      }
      if (!amountInput.value || isNaN(amount) || amount <= 0) {
        errorEl.textContent = "Vui lòng nhập số tiền hợp lệ (lớn hơn 0).";
        errorEl.hidden = false;
        amountInput.focus();
        return;
      }

      var label = category === "Khác" ? desc : category;

      state.entries[person.key].push({
        id: uid(),
        day: day,
        category: category,
        label: label,
        desc: desc, // Lưu ghi chú cụ thể cho bất kì danh mục nào
        amount: amount
      });
      saveData();

      // reset form
      catSelect.value = "Ăn uống";
      otherInput.value = "";
      amountInput.value = "";

      renderDayTable(person.key, day);
      refreshTotals(person.key);
    });

    return frag;
  }

  // ---------- Rendering tables / totals ----------
  function renderDayTable(personKey, day) {
    var section = document.querySelector(
      '.day-entry[data-owner="' + personKey + '"][data-day="' + day + '"]'
    );
    if (!section) return;

    var tbody = section.querySelector(".entries-body");
    var entries = state.entries[personKey].filter(function (e) { return e.day === day; });

    tbody.innerHTML = "";
    if (entries.length === 0) {
      var emptyRow = document.createElement("tr");
      emptyRow.className = "empty-row";
      emptyRow.innerHTML = '<td colspan="4">Chưa có khoản nào cho ngày này.</td>';
      tbody.appendChild(emptyRow);
    } else {
      entries.forEach(function (e) {
        var tr = document.createElement("tr");

        var tdCategory = document.createElement("td");
        tdCategory.textContent = e.category || e.label || "";

        var tdDesc = document.createElement("td");
        var displayDetail = "";
        if (typeof e.desc !== "undefined") {
          displayDetail = e.desc;
        } else if (e.category === "Khác") {
          displayDetail = e.label || "";
        }
        tdDesc.textContent = displayDetail || "-";

        var tdAmount = document.createElement("td");
        tdAmount.className = "num-col";
        tdAmount.textContent = formatVND(e.amount);

        var tdDel = document.createElement("td");
        var delBtn = document.createElement("button");
        delBtn.className = "del-btn";
        delBtn.type = "button";
        delBtn.title = "Xoá khoản này";
        delBtn.textContent = "\u2715";
        delBtn.addEventListener("click", function () {
          var labelText = displayDetail ? (e.category + " (" + displayDetail + ")") : e.category;
          var ok = confirm("Bạn có chắc chắn muốn xoá khoản chi \"" + labelText + "\" này không?");
          if (!ok) return;
          state.entries[personKey] = state.entries[personKey].filter(function (x) { return x.id !== e.id; });
          saveData();
          renderDayTable(personKey, day);
          refreshTotals(personKey);
        });
        tdDel.appendChild(delBtn);

        tr.appendChild(tdCategory);
        tr.appendChild(tdDesc);
        tr.appendChild(tdAmount);
        tr.appendChild(tdDel);
        tbody.appendChild(tr);
      });
    }

    var dayTotalEl = section.querySelector(".day-total");
    var remainEl = section.querySelector(".remaining-total");
    var dTotal = daySpent(personKey, day);
    var cumulative = spentThroughDay(personKey, day);
    var budget = state.budgets[personKey] || 0;
    var remaining = budget - cumulative;

    dayTotalEl.textContent = formatVND(dTotal);
    remainEl.textContent = formatVND(remaining);
    remainEl.classList.remove("positive", "negative");
    remainEl.classList.add(remaining >= 0 ? "positive" : "negative");
  }

  function refreshTotals(personKey) {
    DAYS.forEach(function (day) { renderDayTable(personKey, day); });

    var page = document.querySelector('.page[data-person="' + personKey + '"]');
    if (!page) return;
    var spentEl = page.querySelector(".grand-spent");
    var remainEl = page.querySelector(".grand-remain");

    var spent = totalSpent(personKey);
    var budget = state.budgets[personKey] || 0;
    var remaining = budget - spent;

    spentEl.textContent = formatVND(spent);
    remainEl.textContent = formatVND(remaining);
    remainEl.classList.remove("positive", "negative");
    remainEl.classList.add(remaining >= 0 ? "positive" : "negative");
  }

  function renderAll() {
    PEOPLE.forEach(function (person) {
      // Cập nhật ô budget nếu người dùng không đang gõ dở ở đó (tránh giật con trỏ)
      var page = document.querySelector('.page[data-person="' + person.key + '"]');
      if (page) {
        var budgetInput = page.querySelector(".budget-input");
        if (budgetInput && document.activeElement !== budgetInput) {
          budgetInput.value = state.budgets[person.key] || "";
        }
      }
      refreshTotals(person.key);
    });
  }

  // ---------- Init ----------
  function buildSkeleton() {
    pagesEl.innerHTML = "";
    PEOPLE.forEach(function (person) { buildPersonPage(person); });
    domReady = true;
  }

  function init() {
    connEl = document.getElementById("connStatus");

    buildSkeleton();

    // Person tab switching logic
    var personTabBtns = document.querySelectorAll(".person-tab-btn");
    personTabBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var personKey = btn.getAttribute("data-person-tab");

        // Update active class on tab buttons
        personTabBtns.forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });

        // Update active class on page panels
        var pages = document.querySelectorAll(".page");
        pages.forEach(function (page) {
          var pKey = page.getAttribute("data-person");
          page.classList.toggle("active", pKey === personKey);
        });
      });
    });

    renderAll();

    onSnapshot(
      docRef,
      function (snap) {
        state = snap.exists() ? sanitizeState(snap.data()) : emptyState();
        if (!domReady) buildSkeleton();
        renderAll();
        setConnStatus("Đã đồng bộ với Firebase — mọi thiết bị mở web đều thấy chung dữ liệu này.", false);
      },
      function (err) {
        console.error("Lỗi kết nối Firestore:", err);
        setConnStatus("Không kết nối được Firebase (kiểm tra mạng hoặc Firestore Rules).", true);
      }
    );

    var resetBtn = document.getElementById("resetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        var ok = confirm("Xoá toàn bộ budget và các khoản đã nhập của cả 2 người trên TẤT CẢ thiết bị? Không thể hoàn tác.");
        if (!ok) return;
        state = emptyState();
        saveData();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
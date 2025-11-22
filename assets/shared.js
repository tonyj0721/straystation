const $ = (id) => document.getElementById(id);

// 🔥 左右切換
function lbShow(delta) {
    if (!lbImages.length) return;
    lbIndex = (lbIndex + delta + lbImages.length) % lbImages.length;
    lbImg.src = lbImages[lbIndex];

    const lbThumbsInner = document.getElementById("lbThumbsInner");
    lbThumbsInner.querySelectorAll("img").forEach((el, i) => {
        el.classList.toggle("active", i === lbIndex);
    });
}

lbPrev.addEventListener('click', (e) => {
    e.stopPropagation();
    lbShow(-1);
});

lbNext.addEventListener('click', (e) => {
    e.stopPropagation();
    lbShow(1);
});

// 🔥 點黑幕關閉
lb.addEventListener("click", (e) => {
    if (e.target === lb) closeLightbox();
});

// 🔥 ESC 關閉
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !lb.classList.contains("hidden")) {
        closeLightbox();
    }
});

// 🔥 手機滑動切換
let touchStartX = 0;
lb.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
}, { passive: true });

lb.addEventListener("touchend", (e) => {
    const diff = e.changedTouches[0].clientX - touchStartX;
    if (diff > 50) lbShow(-1);
    if (diff < -50) lbShow(1);
}, { passive: true });

// 🔥 完全阻止背景滑動（桌機 + 手機都有效）
lb.addEventListener("wheel", (e) => {
    e.preventDefault();
    e.stopPropagation();
}, { passive: false });

lb.addEventListener("touchmove", (e) => {
    e.preventDefault();
    e.stopPropagation();
}, { passive: false });

// ======= Theme & Nav（原樣保留） =======
$('#navToggle').addEventListener('click', () => {
    const el = $('#mobileNav');
    el.classList.toggle('hidden');
});

// 點選連結後自動關閉
document.querySelectorAll('#mobileNav a').forEach(a => {
    a.addEventListener('click', () => {
        document.getElementById('mobileNav').classList.add('hidden');
    });
});

const y = document.getElementById('year');
if (y) y.textContent = new Date().getFullYear();
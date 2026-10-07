document.addEventListener("DOMContentLoaded", () => {
  const isTouch = window.matchMedia("(hover: none)").matches;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Footer year ---------- */
  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------- Nav: scrolled state, progress bar, timeline fill ---------- */
  const nav = document.getElementById("nav");
  const progress = document.getElementById("scrollProgress");
  const timeline = document.querySelector(".timeline");
  const timelineFill = document.getElementById("timelineFill");

  const onScroll = () => {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
    nav.classList.toggle("scrolled", y > 30);

    if (timeline && timelineFill) {
      const rect = timeline.getBoundingClientRect();
      const start = window.innerHeight * 0.75;
      const ratio = Math.min(Math.max((start - rect.top) / rect.height, 0), 1);
      timelineFill.style.height = ratio * 100 + "%";
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  const burger = document.getElementById("burger");
  const navLinks = document.getElementById("navLinks");
  const closeMenu = () => {
    burger.classList.remove("open");
    navLinks.classList.remove("open");
    nav.classList.remove("menu-open");
  };
  burger.addEventListener("click", () => {
    const open = !navLinks.classList.contains("open");
    burger.classList.toggle("open", open);
    navLinks.classList.toggle("open", open);
    nav.classList.toggle("menu-open", open);
  });
  navLinks.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMenu));

  /* ---------- Active nav link ---------- */
  const links = [...navLinks.querySelectorAll('a[href^="#"]')];
  const sections = links
    .map((l) => document.querySelector(l.getAttribute("href")))
    .filter(Boolean);

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          links.forEach((l) =>
            l.classList.toggle("active", l.getAttribute("href") === "#" + entry.target.id)
          );
        }
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  sections.forEach((s) => sectionObserver.observe(s));

  /* ---------- Reveal on scroll (with stagger) ---------- */
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const siblings = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
        const index = Math.max(siblings.indexOf(el), 0);
        el.style.transitionDelay = index * 0.12 + "s";
        el.classList.add("in");
        revealObserver.unobserve(el);
        // clear delay afterwards so hover/tilt stays snappy
        setTimeout(() => (el.style.transitionDelay = ""), 1200 + index * 120);
      });
    },
    { threshold: 0.15 }
  );
  document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

  /* ---------- Rotating role (typewriter) ---------- */
  const rotator = document.getElementById("roleRotator");
  const roles = [
    "Operations",
    "Project Management",
    "Business Development",
    "Resource Planning",
    "Process Optimization",
  ];

  if (reduceMotion) {
    rotator.textContent = roles[0];
  } else {
    let roleIndex = 0;
    let charIndex = roles[0].length;
    let deleting = true;

    const tick = () => {
      const current = roles[roleIndex];
      if (deleting) {
        charIndex--;
        rotator.textContent = current.slice(0, charIndex);
        if (charIndex === 0) {
          deleting = false;
          roleIndex = (roleIndex + 1) % roles.length;
        }
        setTimeout(tick, 45);
      } else {
        const next = roles[roleIndex];
        charIndex++;
        rotator.textContent = next.slice(0, charIndex);
        if (charIndex === next.length) {
          deleting = true;
          setTimeout(tick, 2000);
        } else {
          setTimeout(tick, 85);
        }
      }
    };
    setTimeout(tick, 2200);
  }

  /* ---------- Cursor glow ---------- */
  const glow = document.getElementById("cursorGlow");
  if (!isTouch && !reduceMotion) {
    let gx = 0, gy = 0, tx = 0, ty = 0;
    window.addEventListener("mousemove", (e) => {
      tx = e.clientX;
      ty = e.clientY;
      glow.style.opacity = "1";
    });
    document.addEventListener("mouseleave", () => (glow.style.opacity = "0"));
    const follow = () => {
      gx += (tx - gx) * 0.12;
      gy += (ty - gy) * 0.12;
      glow.style.left = gx + "px";
      glow.style.top = gy + "px";
      requestAnimationFrame(follow);
    };
    follow();
  }

  /* ---------- 3D tilt cards ---------- */
  if (!isTouch && !reduceMotion) {
    document.querySelectorAll("[data-tilt]").forEach((card) => {
      const strength = card.classList.contains("hero-card") ? 10 : 5;
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(900px) rotateX(${-py * strength}deg) rotateY(${px * strength}deg) translateY(-4px)`;
      });
      card.addEventListener("mouseleave", () => {
        card.style.transform = "";
      });
    });
  }

  /* ---------- Magnetic buttons ---------- */
  if (!isTouch && !reduceMotion) {
    document.querySelectorAll(".magnetic").forEach((btn) => {
      btn.addEventListener("mousemove", (e) => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${x * 0.18}px, ${y * 0.25}px)`;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "";
      });
    });
  }

  /* ---------- Copy email ---------- */
  const toast = document.getElementById("toast");
  document.getElementById("copyEmail").addEventListener("click", async () => {
    const email = "yuvalguetta222@gmail.com";
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      const tmp = document.createElement("textarea");
      tmp.value = email;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand("copy");
      tmp.remove();
    }
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
  });
});

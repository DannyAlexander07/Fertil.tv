/* =========================================================================
   FÉRTIL — main.js
   Comportamiento GLOBAL compartido por todas las páginas:
     - Preloader con la animación del logo (una vez por sesión)
     - Menú mobile (overlay)
     - Nav como "isla flotante" en páginas con scroll largo
     - Selección de la fuente de video correcta (desktop/mobile) para heroes
   Cada página puede sumar su propio archivo JS (directors.js, about.js...)
   que se carga después de este.
   ========================================================================= */

(function () {
  "use strict";

  var MOBILE_BREAKPOINT = 768;

  /* ---------------------------------------------------------------------
     Señal compartida: "el intro ya terminó (o ni siquiera se mostró)".
     El hero de Inicio la espera antes de arrancar su propio video, así
     nunca se reproducen los dos al mismo tiempo. Si initHeroVideo se
     fija en introDone DESPUÉS de que ya se marcó true, igual arranca
     (no depende únicamente del evento, que podría perderse por orden
     de ejecución).
  --------------------------------------------------------------------- */
  var introDone = false;
  var INTRO_DONE_EVENT = "fertil:introdone";

  function markIntroDone() {
    if (introDone) return;
    introDone = true;
    document.dispatchEvent(new Event(INTRO_DONE_EVENT));
  }

  /* ---------------------------------------------------------------------
     sessionStorage puede no estar disponible (vistas previas dentro de un
     iframe con sandbox, algunos navegadores en modo privado muy estricto,
     etc.) y en ese caso .getItem()/.setItem() TIRAN UNA EXCEPCIÓN. Si eso
     pasa dentro de initPreloader() sin protección, la función entera se
     corta a la mitad: el intro queda reproduciéndose para siempre porque
     nunca se llega a enganchar la lógica que lo oculta. Por eso todo
     acceso a sessionStorage pasa por estos wrappers seguros.
  --------------------------------------------------------------------- */
  function safeStorageGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (e) {
      /* no se pudo persistir: el intro simplemente podría repetirse, pero no rompemos el flujo */
    }
  }

  /* ---------------------------------------------------------------------
     Preloader
     Se muestra la primera vez que se entra al sitio en la sesión del
     navegador (sessionStorage), para no repetir la animación en cada
     cambio de página.
  --------------------------------------------------------------------- */
  function initPreloader() {
    var preloader = document.querySelector("[data-preloader]");
    if (!preloader) return;

    var alreadyPlayed = safeStorageGet("fertilIntroPlayed") === "true";

    if (alreadyPlayed) {
      preloader.remove();
      markIntroDone();
      return;
    }

    document.body.setAttribute("data-preloading", "true");

    var video = preloader.querySelector("video");
    var hidden = false;
    var fallbackTimer = null;

    // La animación original dura ~38s y arranca con ~2s de pantalla en
    // negro (todavía no aparece nada del logo) antes del reveal. Saltamos
    // ese tramo muerto de una y reproducimos el resto mucho más rápido
    // para que el intro se sienta breve.
    var INTRO_SKIP_SECONDS = 2;
    var INTRO_PLAYBACK_RATE = 8;

    function hidePreloader() {
      if (hidden) return;
      hidden = true;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      preloader.setAttribute("data-hide", "true");
      document.body.removeAttribute("data-preloading");
      safeStorageSet("fertilIntroPlayed", "true");
      markIntroDone();
      window.setTimeout(function () {
        if (preloader.parentNode) preloader.parentNode.removeChild(preloader);
      }, 900);
    }

    // El salvavidas debe durar más que la animación real (si no, corta el
    // intro antes de que termine). Apenas conocemos la duración exacta del
    // video, recalculamos el timeout; si el video nunca carga, 8s por defecto.
    function armFallback(ms) {
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      fallbackTimer = window.setTimeout(hidePreloader, ms);
    }

    armFallback(8000);

    if (video) {
      video.playbackRate = INTRO_PLAYBACK_RATE;
      video.addEventListener("loadedmetadata", function () {
        if (video.duration && isFinite(video.duration)) {
          var skip = Math.min(INTRO_SKIP_SECONDS, video.duration / 4);
          try {
            video.currentTime = skip;
          } catch (e) {
            /* algunos navegadores no dejan setear currentTime tan pronto: no pasa nada, sigue desde 0 */
          }
          // video.duration no cambia con playbackRate ni con el salto inicial:
          // hay que restar lo saltado y dividir por la velocidad para saber
          // cuánto va a durar en tiempo real.
          armFallback(((video.duration - skip) / INTRO_PLAYBACK_RATE) * 1000 + 800);
        }
      });
      video.addEventListener("ended", hidePreloader);
      var playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(hidePreloader);
      }
    } else {
      hidePreloader();
    }
  }

  /* ---------------------------------------------------------------------
     Menú mobile
  --------------------------------------------------------------------- */
  function initMobileMenu() {
    var toggle = document.querySelector("[data-nav-toggle]");
    var overlay = document.querySelector("[data-nav-overlay]");
    if (!toggle || !overlay) return;

    function setOpen(open) {
      overlay.setAttribute("data-open", open ? "true" : "false");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
      // En páginas con nav claro (.nav--on-light: Directors, Contact, etc.)
      // el botón hamburguesa/X y el nombre de marca usan currentColor en
      // tono oscuro (ink) -- sobre el overlay casi negro del menú eso los
      // deja invisibles (oscuro sobre oscuro). Esta clase le da a esos
      // navs el mismo blanco que ya usan al flotar, solo mientras el menú
      // está abierto.
      document.body.classList.toggle("nav-menu-open", open);
    }

    toggle.addEventListener("click", function () {
      var isOpen = overlay.getAttribute("data-open") === "true";
      setOpen(!isOpen);
    });

    var links = overlay.querySelectorAll("a");
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener("click", function () {
        setOpen(false);
      });
    }
  }

  /* ---------------------------------------------------------------------
     Nav "isla flotante"
     Solo se activa en páginas que lo pidan explícitamente vía
     data-nav-behavior="float-on-scroll" en el <header class="nav">.
     En Inicio no aplica (es una sola pantalla, no hay scroll).
  --------------------------------------------------------------------- */
  function initFloatingNav() {
    var nav = document.querySelector("[data-nav]");
    if (!nav || nav.getAttribute("data-nav-behavior") !== "float-on-scroll") return;

    var THRESHOLD = 40;

    // Color del texto del nav: NO depende de si está "flotando" (eso sólo
    // define el layout -- ancho completo/altura reducida, ver .nav--floating
    // en style.css). Depende de qué hay REALMENTE detrás del nav en cada
    // instante del scroll -- páginas como About tienen un hero clarísimo
    // (mostaza) seguido de secciones bien oscuras (FOUNDERS, fondo negro):
    // si el texto pasara a blanco apenas se activa el modo flotante (a los
    // 40px de scroll, todavía sobre el mostaza) quedaría casi invisible ahí,
    // y recién por casualidad se leería bien una vez alcanzada la sección
    // negra. Por eso se marcan esas secciones con [data-nav-theme="dark"] en
    // el HTML y acá se revisa, en cada scroll, si el nav cae encima de
    // alguna de ellas -- sólo ahí se suma .nav--on-dark (texto blanco). En
    // páginas sin ninguna sección marcada así, este querySelectorAll da
    // vacío y .nav--on-dark nunca se activa: no cambia nada para ellas.
    var darkSections = document.querySelectorAll('[data-nav-theme="dark"]');

    function updateNavTheme() {
      if (!darkSections.length) return;
      var navRect = nav.getBoundingClientRect();
      var navMidY = navRect.top + navRect.height / 2;
      var overDark = false;
      for (var i = 0; i < darkSections.length; i++) {
        var r = darkSections[i].getBoundingClientRect();
        if (navMidY >= r.top && navMidY <= r.bottom) { overDark = true; break; }
      }
      nav.classList.toggle("nav--on-dark", overDark);
    }

    function onScroll() {
      nav.classList.toggle("nav--floating", window.scrollY > THRESHOLD);
      updateNavTheme();
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
  }

  /* ---------------------------------------------------------------------
     Video hero: carga solo la fuente que corresponde al viewport actual
     (evita descargar el video de desktop en mobile y viceversa).
  --------------------------------------------------------------------- */
  function initHeroVideo() {
    var hero = document.querySelector("[data-hero-video]");
    if (!hero) return;

    var sources = {
      desktop: {
        webm: hero.getAttribute("data-desktop-webm"),
        mp4: hero.getAttribute("data-desktop-mp4"),
        poster: hero.getAttribute("data-poster-desktop")
      },
      mobile: {
        webm: hero.getAttribute("data-mobile-webm"),
        mp4: hero.getAttribute("data-mobile-mp4"),
        poster: hero.getAttribute("data-poster-mobile")
      }
    };

    var loadedBreakpoint = null;

    function pickSource() {
      var breakpoint = window.innerWidth <= MOBILE_BREAKPOINT ? "mobile" : "desktop";
      if (breakpoint === loadedBreakpoint) return;

      var set = sources[breakpoint];
      if (!set.webm && !set.mp4) return;

      // Limpiamos los <source> previos y armamos los nuevos: webm primero
      // (más liviano), mp4 como fallback para navegadores sin soporte VP9.
      while (hero.firstChild) hero.removeChild(hero.firstChild);

      if (set.webm) {
        var webmSource = document.createElement("source");
        webmSource.src = set.webm;
        webmSource.type = "video/webm";
        hero.appendChild(webmSource);
      }
      if (set.mp4) {
        var mp4Source = document.createElement("source");
        mp4Source.src = set.mp4;
        mp4Source.type = "video/mp4";
        hero.appendChild(mp4Source);
      }

      hero.setAttribute("poster", set.poster || "");
      loadedBreakpoint = breakpoint;
      hero.load();

      playHero();
    }

    // El hero arranca a reproducirse DE UNA, aunque el preloader del logo
    // siga en pantalla encima. Como el preloader es un overlay fijo de
    // fondo negro sólido (cubre toda la ventana), el hero queda tapado e
    // invisible mientras tanto -- pero llega ya reproduciéndose, sin
    // trabarse, apenas el preloader se desvanece.
    // Antes se esperaba a que el intro terminara para recién ahí llamar a
    // .play(): si en ese instante puntual el video del hero todavía no
    // había cargado lo suficiente, se alcanzaba a ver un instante la
    // imagen del poster antes de que arrancara el video de verdad.
    function playHero() {
      var playPromise = hero.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(function () {
          /* autoplay bloqueado por el navegador: se queda mostrando el poster */
        });
      }
    }

    // pickSource() siempre entra a su rama la primera vez (loadedBreakpoint
    // arranca en null) y ya llama a playHero() ahí adentro -- no hace falta
    // llamarla de nuevo acá.
    pickSource();

    var resizeTimer;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(pickSource, 250);
    });
  }

  // Cada init corre aislado: si uno falla por algo imprevisto, no debe
  // impedir que los demás (sobre todo ocultar el preloader) sigan andando.
  function safeInit(fn) {
    try {
      fn();
    } catch (e) {
      if (window.console && console.error) console.error("Fértil main.js:", e);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    safeInit(initPreloader);
    safeInit(initMobileMenu);
    safeInit(initFloatingNav);
    safeInit(initHeroVideo);
  });
})();

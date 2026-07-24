/* =========================================================================
   FÉRTIL — directors.js
   Página dinámica de Directors, alimentada por data/directors.json:
     - Listado (fondo mostaza) con preview de fondo al hover (desktop) o
       tap (mobile) sobre el nombre de cada director.
     - Vista de detalle por director: grilla de videos (carrusel en desktop,
       lista vertical con scroll en mobile).
     - Modal de video: iframe de Simian.me + flechas prev/next + filmstrip
       de miniaturas para saltar entre videos sin cerrar el modal.
   Depende de que JS/main.js ya se haya cargado (nav, menú mobile, etc.).
   ========================================================================= */

(function () {
  "use strict";

  var DATA_URL = "../data/directors.json";
  var HOVER_CAPABLE = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  var state = {
    directors: [],
    bySlug: {},
    activeSlug: null,       // director cuya vista de detalle está abierta
    previewSlug: null,      // director cuyo fondo se está previsualizando en el listado
    modalIndex: -1          // índice del video abierto en el modal (dentro del director activo)
  };

  /* ---------------------------------------------------------------------
     Carga de datos: fetch primero (sirve para http/https real); si falla
     -- file://, algún preview en sandbox, red bloqueada -- se usa la copia
     embebida en <script type="application/json" id="directors-data">.
  --------------------------------------------------------------------- */
  function loadData() {
    function fromInlineFallback() {
      var el = document.getElementById("directors-data");
      if (!el) return { directors: [] };
      try {
        return JSON.parse(el.textContent);
      } catch (e) {
        return { directors: [] };
      }
    }

    if (!window.fetch) {
      return Promise.resolve(fromInlineFallback());
    }

    return fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("directors.json HTTP " + res.status);
        return res.json();
      })
      .catch(function () {
        return fromInlineFallback();
      });
  }

  /* ---------------------------------------------------------------------
     Utilidades DOM
  --------------------------------------------------------------------- */
  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------------------------------------------------------------------
     Precarga las fotos de preview de todos los directores apenas llegan
     los datos -- si no, la primera vez que se pasa el mouse por un
     director el navegador recién ahí pide la imagen, y mientras carga se
     ve el scrim oscuro solo (sin foto detrás) unos instantes antes de que
     aparezca. Con esto ya quedan en la caché del navegador de entrada, así
     que el hover se ve instantáneo como con cualquier otra imagen chica.
  --------------------------------------------------------------------- */
  function preloadPreviewImages() {
    state.directors.forEach(function (director) {
      if (!director.previewImage) return;
      var img = new Image();
      img.src = "../" + director.previewImage;
    });
  }

  /* ---------------------------------------------------------------------
     Listado de directores (VISTA A)
  --------------------------------------------------------------------- */
  function renderList() {
    var list = document.querySelector("[data-directors-names]");
    if (!list) return;

    list.innerHTML = "";

    state.directors.forEach(function (director) {
      var li = el("li", "directors-list__item");
      var button = el("button", "directors-list__name", escapeHtml(director.name));
      button.type = "button";
      button.setAttribute("data-slug", director.slug);

      if (HOVER_CAPABLE) {
        // Desktop: el hover ya funciona como preview; un solo click entra al detalle.
        button.addEventListener("mouseenter", function () {
          setPreview(director.slug);
        });
        button.addEventListener("mouseleave", function () {
          setPreview(null);
        });
        button.addEventListener("click", function () {
          openDetail(director.slug);
        });
      } else {
        // Mobile/touch: primer tap = preview, segundo tap sobre el mismo nombre = entra.
        button.addEventListener("click", function (evt) {
          evt.preventDefault();
          if (state.previewSlug === director.slug) {
            openDetail(director.slug);
          } else {
            setPreview(director.slug);
          }
        });
      }

      li.appendChild(button);
      list.appendChild(li);
    });
  }

  var previewClearTimer = null;

  function setPreview(slug) {
    // El mouseleave de un director y el mouseenter del siguiente llegan como
    // dos llamadas separadas (setPreview(null) y luego setPreview(otroSlug)),
    // aunque en la práctica pasen casi al toque. Si apagáramos el preview de
    // inmediato en el primer llamado, alcanzábamos a pintar un frame de
    // "sin preview" en el medio -- ahí es donde Florian se veía raro: sus
    // barras oscuras (ver directors.css) desaparecen sin transición apenas
    // se saca el atributo data-preview-slug, así que por un instante se veía
    // su foto YA sin barras (a pantalla completa) y recién empezando a
    // desvanecerse, un salto brusco antes del fundido.
    // Solución: retrasar un poco el apagado; si el siguiente setPreview(slug)
    // llega antes de que corra ese timeout (el caso normal al pasar de un
    // nombre a otro en la lista), lo cancela y nunca se pasa por el estado
    // intermedio -- el cambio queda directo, sin ese salto.
    if (previewClearTimer) {
      window.clearTimeout(previewClearTimer);
      previewClearTimer = null;
    }

    if (!slug) {
      previewClearTimer = window.setTimeout(function () {
        previewClearTimer = null;
        applyPreview(null);
      }, 80);
      return;
    }

    applyPreview(slug);
  }

  function applyPreview(slug) {
    state.previewSlug = slug;
    var bg = document.querySelector("[data-list-bg]");
    var buttons = document.querySelectorAll(".directors-list__name");

    buttons.forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-slug") === slug);
    });

    var listSection = document.querySelector("[data-directors-list]");
    var hasPreview = !!(slug && state.bySlug[slug]);
    if (listSection) {
      listSection.classList.toggle("has-preview", hasPreview);
      // Permite que el CSS distinga director por director -- Florian, por
      // ejemplo, necesita su propio tratamiento (ver directors.css) porque
      // su video fuente ya trae un pillarbox propio, a diferencia del resto.
      if (hasPreview) {
        listSection.setAttribute("data-preview-slug", slug);
      } else {
        listSection.removeAttribute("data-preview-slug");
      }
    }
    document.body.classList.toggle("preview-active", hasPreview);

    if (!bg) return;

    if (hasPreview) {
      bg.style.backgroundImage = 'url("../' + state.bySlug[slug].previewImage + '")';
      bg.classList.add("is-visible");
    } else {
      bg.classList.remove("is-visible");
    }
  }

  /* ---------------------------------------------------------------------
     Detalle de director (VISTA B): grilla + carrusel
  --------------------------------------------------------------------- */
  function openDetail(slug) {
    if (!state.bySlug[slug]) return;
    state.activeSlug = slug;
    window.location.hash = slug;
    renderDetail(slug);
  }

  function closeDetail() {
    state.activeSlug = null;
    if (window.location.hash) {
      history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    showListView();
  }

  function showListView() {
    var listSection = document.querySelector("[data-directors-list]");
    var detailSection = document.querySelector("[data-director-detail]");
    if (listSection) listSection.hidden = false;
    if (detailSection) detailSection.hidden = true;
    setPreview(null);
  }

  function showDetailView() {
    var listSection = document.querySelector("[data-directors-list]");
    var detailSection = document.querySelector("[data-director-detail]");
    if (listSection) listSection.hidden = true;
    if (detailSection) detailSection.hidden = false;
    // Limpia el estado de "preview" al entrar al detalle. Si no, el body
    // queda con .preview-active (que pinta el nav de BLANCO para contrastar
    // sobre la foto oscura del listado) -- pero el detalle tiene fondo BLANCO,
    // así que el nav blanco quedaba invisible hasta que uno scrolleaba o
    // recargaba. Con esto el nav vuelve a texto oscuro y se ve de una.
    applyPreview(null);
  }

  function renderDetail(slug) {
    var director = state.bySlug[slug];
    if (!director) return;

    showDetailView();

    var nameEl = document.querySelector("[data-director-name]");
    if (nameEl) nameEl.textContent = director.name.toUpperCase();

    var grid = document.querySelector("[data-director-grid]");
    if (!grid) return;
    grid.innerHTML = "";

    director.videos.forEach(function (video, index) {
      var li = el("li", "director-detail__item");
      var button = el(
        "button",
        "director-detail__thumb",
        '<img src="../' + video.thumb + '" alt="" loading="lazy">' +
          '<span class="director-detail__caption">' + escapeHtml(video.title) + "</span>"
      );
      button.type = "button";
      button.addEventListener("click", function () {
        openModal(slug, index);
      });
      li.appendChild(button);
      grid.appendChild(li);
    });

    // El <ul> de la grilla se reutiliza entre directores (solo se le
    // reemplaza el innerHTML); el navegador puede conservar el scrollLeft
    // que tenía con el director anterior, así que sin esto el carrusel
    // podía abrir "a la mitad" en vez de empezar siempre desde el inicio.
    grid.scrollLeft = 0;

    updateGridArrows();
  }

  function updateGridArrows() {
    var wrap = document.querySelector(".director-detail__grid-wrap");
    var grid = document.querySelector("[data-director-grid]");
    var prevBtn = document.querySelector("[data-grid-prev]");
    var nextBtn = document.querySelector("[data-grid-next]");
    if (!wrap || !grid || !prevBtn || !nextBtn) return;

    function refresh() {
      var scrollable = grid.scrollWidth > grid.clientWidth + 4;
      wrap.classList.toggle("has-scroll", scrollable);
      prevBtn.hidden = !scrollable || grid.scrollLeft <= 4;
      nextBtn.hidden = !scrollable || grid.scrollLeft >= grid.scrollWidth - grid.clientWidth - 4;
    }

    grid.removeEventListener("scroll", grid._fertilScrollHandler || function () {});
    grid._fertilScrollHandler = refresh;
    grid.addEventListener("scroll", refresh, { passive: true });

    prevBtn.onclick = function () {
      grid.scrollBy({ left: -grid.clientWidth * 0.9, behavior: "smooth" });
    };
    nextBtn.onclick = function () {
      grid.scrollBy({ left: grid.clientWidth * 0.9, behavior: "smooth" });
    };

    // Layout todavía no calculado en el primer frame: refrescamos con un pequeño delay.
    refresh();
    window.setTimeout(refresh, 50);
  }

  /* ---------------------------------------------------------------------
     Modal de video: iframe Simian.me + flechas + filmstrip
     Nota: por ahora cada director tiene UN solo link de Simian (su reel
     completo); mientras no existan links individuales por spot, todas las
     miniaturas de un mismo director abren ese mismo reel -- las flechas y
     el filmstrip ya quedan listos para cuando se sumen links por video.
  --------------------------------------------------------------------- */

  // Ratio del video que está abierto ahora mismo en el modal (número, no
  // string) -- lo usa fitFrameInner() para recalcular el recuadro interno
  // cada vez que la ventana cambia de tamaño mientras el modal está abierto.
  var currentModalRatio = 16 / 9;

  function parseAspectRatio(str) {
    if (!str) return 16 / 9;
    var parts = String(str).split("/");
    var a = parseFloat(parts[0]);
    var b = parseFloat(parts[1]);
    if (!a || !b) return 16 / 9;
    return a / b;
  }

  // Achica/agranda el recuadro interno (.video-modal__frame-inner) para que
  // quepa ENTERO dentro del marco de 16:9 (.video-modal__frame) sin
  // deformarse, sea cual sea su proporción real -- más angosto que 16:9
  // (ej. 4:3, "Burger King - Oumph") o más ancho (ej. ~1.9:1, "El Gesto").
  // Se calcula en píxeles (no alcanza con max-width en CSS: si el video es
  // más ANCHO que el marco, lo que hay que limitar es el alto, no el ancho).
  function fitFrameInner(frame, ratio) {
    if (!frame) return;
    var inner = frame.querySelector(".video-modal__frame-inner");
    if (!inner) return;
    var fw = frame.clientWidth;
    var fh = frame.clientHeight;
    if (!fw || !fh) return;
    var frameRatio = fw / fh;
    var w, h;
    if (ratio <= frameRatio) {
      // Mismo alto que el marco, ancho más chico (barras negras a los lados).
      h = fh;
      w = fh * ratio;
    } else {
      // Mismo ancho que el marco, alto más chico (barras negras arriba/abajo).
      w = fw;
      h = fw / ratio;
    }
    inner.style.width = w + "px";
    inner.style.height = h + "px";
  }

  function openModal(slug, index) {
    var director = state.bySlug[slug];
    if (!director) return;

    state.activeSlug = slug;
    state.modalIndex = index;

    var modal = document.querySelector("[data-video-modal]");
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";

    renderFilmstrip(slug);
    updateModal();
  }

  function closeModal() {
    var modal = document.querySelector("[data-video-modal]");
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";

    var frame = document.querySelector("[data-modal-frame]");
    if (frame) frame.innerHTML = ""; // corta la reproducción del iframe al cerrar
  }

  function updateModal() {
    var director = state.bySlug[state.activeSlug];
    if (!director) return;
    var video = director.videos[state.modalIndex];
    if (!video) return;

    var frame = document.querySelector("[data-modal-frame]");
    var caption = document.querySelector("[data-modal-caption]");
    var prevBtn = document.querySelector("[data-modal-prev]");
    var nextBtn = document.querySelector("[data-modal-next]");

    if (frame) {
      // El iframe de Simian (o el reel completo como respaldo) tarda un
      // instante en cargar -- sin esto se veía el recuadro negro pelado
      // ese rato, como si no hubiera pasado nada. El spinner (ver CSS)
      // se muestra mientras tanto y se saca solo con el evento "load"
      // del iframe.
      // El marco (.video-modal__frame) SIEMPRE mide 16:9 -- si cambiara
      // de alto según el video, el título y el filmstrip de abajo
      // saltarían de lugar entre un video y otro. La mayoría de los
      // videos son 16:9 y llenan el marco entero; algún spot puntual
      // viene en otra proporción (ej. 4:3 en "Burger King - Oumph", o
      // ~1.9:1 en "El Gesto") -- si el JSON trae "aspectRatio" para ese
      // video, fitFrameInner() calcula en píxeles cuánto debe medir el
      // contenedor interno (.video-modal__frame-inner) para caber ENTERO
      // dentro del marco sin deformarse, centrado con barras negras
      // (más angosto: barras a los costados; más ancho: arriba/abajo),
      // en vez de estirar el marco entero o descentrar el play de Simian.
      currentModalRatio = parseAspectRatio(video.aspectRatio);
      frame.classList.add("is-loading");
      frame.innerHTML =
        '<div class="video-modal__frame-inner">' +
        '<iframe src="' + escapeHtml(video.reelUrl || director.reelUrl) +
        '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" title="' +
        escapeHtml(video.title) + '"></iframe></div>';
      fitFrameInner(frame, currentModalRatio);
      var iframeEl = frame.querySelector("iframe");
      if (iframeEl) {
        iframeEl.addEventListener("load", function () {
          frame.classList.remove("is-loading");
        });
      }
    }
    if (caption) caption.textContent = video.title;
    if (prevBtn) prevBtn.hidden = director.videos.length <= 1;
    if (nextBtn) nextBtn.hidden = director.videos.length <= 1;

    var thumbs = document.querySelectorAll(".video-modal__filmstrip-item");
    thumbs.forEach(function (thumb, i) {
      thumb.classList.toggle("is-active", i === state.modalIndex);
    });
  }

  function stepModal(delta) {
    var director = state.bySlug[state.activeSlug];
    if (!director) return;
    var total = director.videos.length;
    state.modalIndex = (state.modalIndex + delta + total) % total;
    updateModal();
  }

  function renderFilmstrip(slug) {
    var director = state.bySlug[slug];
    var strip = document.querySelector("[data-modal-filmstrip]");
    if (!director || !strip) return;

    strip.innerHTML = "";
    director.videos.forEach(function (video, index) {
      var li = el("li", "video-modal__filmstrip-item");
      var button = el("button", "", '<img src="../' + video.thumb + '" alt="' + escapeHtml(video.title) + '">');
      button.type = "button";
      button.addEventListener("click", function () {
        state.modalIndex = index;
        updateModal();
      });
      li.appendChild(button);
      strip.appendChild(li);
    });
  }

  function wireModalControls() {
    var closeBtn = document.querySelector("[data-modal-close]");
    var prevBtn = document.querySelector("[data-modal-prev]");
    var nextBtn = document.querySelector("[data-modal-next]");
    var modal = document.querySelector("[data-video-modal]");

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (prevBtn) prevBtn.addEventListener("click", function () { stepModal(-1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { stepModal(1); });

    if (modal) {
      modal.addEventListener("click", function (evt) {
        if (evt.target === modal) closeModal();
      });
    }

    document.addEventListener("keydown", function (evt) {
      if (modal && modal.hidden) return;
      if (evt.key === "Escape") closeModal();
      if (evt.key === "ArrowLeft") stepModal(-1);
      if (evt.key === "ArrowRight") stepModal(1);
    });
  }

  function wireDetailClose() {
    // El botón de "volver" reutiliza el logo/brand del nav: click en "Directors"
    // del nav (activo) regresa siempre al listado en esta misma página.
    var directorsLinks = document.querySelectorAll('.nav__links a[href*="directors.html"], .nav__menu-overlay a[href*="directors.html"]');
    directorsLinks.forEach(function (a) {
      a.addEventListener("click", function (evt) {
        if (state.activeSlug) {
          evt.preventDefault();
          closeDetail();
        }
      });
    });
  }

  function applyHash() {
    var slug = window.location.hash.replace("#", "");
    if (slug && state.bySlug[slug]) {
      state.activeSlug = slug;
      renderDetail(slug);
    } else {
      showListView();
    }
  }

  /* ---------------------------------------------------------------------
     Init
  --------------------------------------------------------------------- */
  function init() {
    loadData().then(function (data) {
      state.directors = (data && data.directors) || [];
      state.bySlug = {};
      state.directors.forEach(function (d) {
        state.bySlug[d.slug] = d;
      });

      renderList();
      preloadPreviewImages();
      wireModalControls();
      wireDetailClose();
      applyHash();

      window.addEventListener("hashchange", applyHash);
      window.addEventListener("resize", function () {
        window.clearTimeout(window._fertilGridResizeTimer);
        window._fertilGridResizeTimer = window.setTimeout(updateGridArrows, 200);

        // Si el modal de video está abierto y la ventana cambia de tamaño
        // (o el usuario gira el celular), el recuadro interno con la
        // proporción real del video (ver fitFrameInner) hay que
        // recalcularlo -- si no, queda con el tamaño en px que tenía
        // antes del resize y se ve chico/grande de más.
        var modal = document.querySelector("[data-video-modal]");
        if (modal && !modal.hidden) {
          fitFrameInner(document.querySelector("[data-modal-frame]"), currentModalRatio);
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

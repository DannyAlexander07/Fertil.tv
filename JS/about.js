/* =========================================================================
   FÉRTIL — about.js
   Efecto de la sección hero de About: el logo "Fértil" es UN SOLO elemento
   (data-logo-img) que about.js alterna entre dos modos comparando su slot
   (data-logo-slot -- su lugar reservado en el flujo normal, justo antes de
   la fila de íconos) contra el centro de la pantalla:

     - "pegado" (.is-pinned, position:fixed, centrado en pantalla): mientras
       el slot -- su posición NATURAL en el documento -- todavía no llegó al
       centro de la pantalla. El logo se ve fijo ahí, mientras el texto de
       atrás sigue el scroll normal y pasa "por debajo" de él.
     - "en flujo" (sin .is-pinned): apenas el scroll normal de la página
       hace que el slot alcance ese mismo punto, se saca la clase -- el logo
       pasa a su posición normal dentro del slot, que en ese instante
       coincide exactamente con donde ya estaba fijo. Al ser el MISMO
       elemento (no una segunda copia) no hay salto ni doble logo visible.

   Cada párrafo tiene además una copia "fantasma" idéntica
   (.reveal-text__ghost) en un tono más claro, recortada (CSS mask) con un
   bloque RECTANGULAR del mismo tamaño que el logo (no su silueta -- eso
   dejaba partes del texto sin revelar aun estando debajo del logo, ver
   comentario en about.css). En cada frame de scroll medimos en qué
   posición de la pantalla está el logo (getBoundingClientRect) y movemos
   ese rectángulo a esa misma posición, convertida a coordenadas locales
   de cada párrafo. Resultado: el tono claro aparece parejo en TODO el
   texto que en ese instante del scroll cae bajo el logo.
   ========================================================================= */

(function () {
  "use strict";

  function initLogoPin() {
    var slot = document.querySelector("[data-logo-slot]");
    var logoImg = document.querySelector("[data-logo-img]");
    var ghosts = document.querySelectorAll(".reveal-text__ghost");
    if (!slot || !logoImg) return;

    // El mask-image en sí (un rectángulo sólido, no la silueta del logo)
    // ya está fijo en about.css -- acá sólo movemos su posición/tamaño
    // (--reveal-mask-pos/--reveal-mask-size) para que coincida con el
    // rectángulo del logo en cada instante del scroll.

    var ticking = false;

    function update() {
      ticking = false;
      var viewportH = window.innerHeight || document.documentElement.clientHeight;

      // El slot reserva su lugar en el flujo normal SIEMPRE (esté el logo
      // pegado o no) -- por eso su posición refleja el scroll normal de la
      // página, sin importar el modo actual del logo. Comparamos su centro
      // contra la misma altura en la que .is-pinned centra el logo (33%
      // de la pantalla, ver about.css) para decidir cuándo "soltarlo".
      var slotRect = slot.getBoundingClientRect();
      var slotCenter = slotRect.top + slotRect.height / 2;
      var pinnedCenter = viewportH * 0.33;
      var shouldPin = slotCenter > pinnedCenter;
      logoImg.classList.toggle("is-pinned", shouldPin);

      var logoRect = logoImg.getBoundingClientRect();
      if (!logoRect.width || !logoRect.height) return;

      for (var j = 0; j < ghosts.length; j++) {
        var ghost = ghosts[j];
        var parentRect = ghost.parentElement.getBoundingClientRect();
        var x = logoRect.left - parentRect.left;
        var y = logoRect.top - parentRect.top;
        ghost.style.setProperty("--reveal-mask-pos", x + "px " + y + "px");
        ghost.style.setProperty("--reveal-mask-size", logoRect.width + "px " + logoRect.height + "px");
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Estado inicial (por si la página carga ya scrolleada, ej. al recargar).
    update();
    // Recién ahora el logo está en su posición correcta (pegado sobre el
    // mostaza si estamos arriba, o fuera de vista si la página cargó ya
    // scrolleada en una sección negra). Lo revelamos: hasta este punto está
    // oculto vía CSS (.has-js .about-hero__logo sin .is-ready) para que, al
    // refrescar estando scrolleado, NO se vea el logo negro fijo flotando
    // sobre el fondo negro un instante antes de que el JS lo reacomode.
    logoImg.classList.add("is-ready");
  }

  function safeInit(fn) {
    try {
      fn();
    } catch (e) {
      if (window.console && console.error) console.error("Fértil about.js:", e);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    safeInit(initLogoPin);
  });
})();

(function () {
  const STORAGE_KEY_PREFIX = "jeu_coop_";
  const OVERVIEW_MAP_MAX_ZOOM = 16;
  const OVERVIEW_MAP_ZOOM_STEP = 0.25;
  const FAR_HINT_THRESHOLD_METERS = 200;
  const NO_CLUE_REWARD_TEXT = "Désolé, ce site n'a pas d'indices";
  const PHOTO_CHALLENGE_PREFIX = "defi photo";
  const PHOTO_CHALLENGE_PROMPT_PREFIX = "prenez une photo dont le titre serait";
  const GPS_TEST_REWARD_TITLE = "Point test GPS";
  const REWARD_ICON_FILE = "./assets/thumbup.png";
  const GAME_CONFIG_DEFAULT_URL = "/gameConfig.json";
  const FALLBACK_SITE_TITLE = "Chargement du jeu...";
  const FALLBACK_SITE_LOGO_SRC = "./assets/logo.svg";
  const INITIAL_SITE_LOGO_ELEMENT = document.getElementById("siteLogo");
  const INITIAL_SITE_TITLE = readOptionalString(document.title) || FALLBACK_SITE_TITLE;
  const INITIAL_SITE_LOGO_SRC =
    readOptionalString(INITIAL_SITE_LOGO_ELEMENT && INITIAL_SITE_LOGO_ELEMENT.getAttribute("src")) ||
    FALLBACK_SITE_LOGO_SRC;
  const REWARD_TYPE_REWARD = "REWARD";
  const REWARD_TYPE_DEFIPHOTO = "DEFIPHOTO";
  const REWARD_TYPE_NOTHING = "NOTHING";
  const OVERVIEW_TABS = ["home", "map", "places"];
  const GEO_TRACKING_MIN_RENDER_DISTANCE_METERS = 8;
  const GEO_TRACKING_MAX_RENDER_INTERVAL_MS = 15000;
  const GEO_TRACKING_RECENTER_MAX_AGE_MS = 30000;
  const GEO_TRACKING_RECENTER_FALLBACK_MAX_AGE_MS = 120000;
  const GEO_TRACKING_RECENTER_TIMEOUT_MS = 2500;
  const GPS_QUALITY_MAX_AGE_MS = 600000;
  const GPS_QUALITY_GREEN_MAX_ACCURACY_METERS = 30;
  const GPS_QUALITY_YELLOW_MAX_ACCURACY_METERS = 80;
  const OVERVIEW_AUTO_RECENTER_MIN_MOVE_METERS = 18;
  const OVERVIEW_AUTO_RECENTER_MIN_INTERVAL_MS = 1200;
  const OVERVIEW_AUTO_RECENTER_REQUIRED_UPDATES = 2;
  const OVERVIEW_AUTO_RECENTER_ANIMATION_SECONDS = 0.85;
  const POI_FOUND_SOUND_FILE = "./victory.mp3";
  const POI_FOUND_SOUND_VOLUME = 0.95;
  const MAX_TIMER_DELAY_MS = 2147483647;
  const GEO_TRACKING_OPTIONS = {
    precise: {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 4000
    }
  };

  const elements = {
    siteLogo: document.getElementById("siteLogo"),
    siteName: document.getElementById("siteName"),
    gameInfo: document.getElementById("gameInfo"),
    fullscreenToggle: document.getElementById("fullscreenToggle"),
    helpToggle: document.getElementById("helpToggle"),
    helpPanel: document.getElementById("helpPanel"),
    helpClose: document.getElementById("helpClose"),
    overviewTabs: document.querySelector(".overview-tabs"),
    overviewMap: document.getElementById("overviewMap"),
    tabHome: document.getElementById("tabHome"),
    tabMap: document.getElementById("tabMap"),
    tabPlaces: document.getElementById("tabPlaces"),
    homePanel: document.getElementById("homePanel"),
    homeContent: document.getElementById("homeContent"),
    mapPanel: document.getElementById("mapPanel"),
    placesPanel: document.getElementById("placesPanel"),
    progressPill: document.getElementById("progressPill"),
    gpsQualityBadge: document.getElementById("gpsQualityBadge"),
    placesList: document.getElementById("placesList"),
    overviewStatusBox: document.getElementById("overviewStatusBox"),
    missionModal: document.getElementById("missionModal"),
    missionPanel: document.getElementById("missionPanel"),
    missionBackdrop: document.getElementById("missionBackdrop"),
    missionClose: document.getElementById("missionClose"),
    missionMeta: document.getElementById("missionMeta"),
    missionTitle: document.getElementById("missionTitle"),
    missionAnecdote: document.getElementById("missionAnecdote"),
    missionHint: document.getElementById("missionHint"),
    missionStatusBox: document.getElementById("missionStatusBox"),
    questionPanel: document.getElementById("questionPanel"),
    questionPrompt: document.getElementById("questionPrompt"),
    questionAnswer: document.getElementById("questionAnswer"),
    questionSubmit: document.getElementById("questionSubmit"),
    geolocationButton: document.getElementById("geolocationButton")
  };

  const state = {
    config: null,
    isHelpOpen: false,
    isMissionOpen: false,
    isLoadingValidation: false,
    isLocatingOnOverview: false,
    selectedZoneId: null,
    overviewMapInstance: null,
    overviewPendingMarkersLayer: null,
    overviewFoundMarkersLayer: null,
    overviewUserLayer: null,
    overviewCycleLayer: null,
    activeOverviewTab: "home",
    locationWatchId: null,
    locationWatchMode: "",
    lastKnownPosition: null,
    lastRenderedPosition: null,
    lastUserPositionRenderAt: 0,
    lastAutoCenterPosition: null,
    lastAutoCenterAt: 0,
    autoCenterMovementDetections: 0,
    hasPlayedMissionCelebration: false,
    missionCelebrationTimerId: null,
    serverClockOffsetMs: 0,
    gameUnlockTimerId: null
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    await loadConfig();
    refreshGameStartAccessState();
    renderMainView();
    syncLocationTracking();
    syncFullscreenButton();
  }

  function bindEvents() {
    if (elements.geolocationButton) {
      elements.geolocationButton.addEventListener("click", handleMissionValidation);
    }

    if (elements.questionSubmit) {
      elements.questionSubmit.addEventListener("click", handleQuestionSubmit);
    }

    if (elements.questionAnswer) {
      elements.questionAnswer.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") {
          return;
        }

        event.preventDefault();
        handleQuestionSubmit();
      });
    }

    if (elements.placesList) {
      elements.placesList.addEventListener("click", handlePlacesListClick);
    }

    if (elements.tabMap) {
      elements.tabMap.addEventListener("click", function () {
        switchOverviewTab("map");
      });
    }

    if (elements.tabHome) {
      elements.tabHome.addEventListener("click", function () {
        switchOverviewTab("home");
      });
    }

    if (elements.tabPlaces) {
      elements.tabPlaces.addEventListener("click", function () {
        switchOverviewTab("places");
      });
    }

    if (elements.missionClose) {
      elements.missionClose.addEventListener("click", closeMissionModal);
    }

    if (elements.missionBackdrop) {
      elements.missionBackdrop.addEventListener("click", closeMissionModal);
    }

    if (elements.helpToggle) {
      elements.helpToggle.addEventListener("click", toggleHelpPanel);
    }

    if (elements.helpClose) {
      elements.helpClose.addEventListener("click", closeHelpPanel);
    }

    if (elements.fullscreenToggle) {
      elements.fullscreenToggle.addEventListener("click", toggleFullscreen);
    }

    document.addEventListener("keydown", handleGlobalKeydown);
    document.addEventListener("click", handleGlobalClick);
    document.addEventListener("fullscreenchange", syncFullscreenButton);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    window.addEventListener("resize", updateProgressPill);
    window.addEventListener("orientationchange", updateProgressPill);
    window.addEventListener("pagehide", stopLocationTracking);
  }

  function handleVisibilityChange() {
    syncLocationTracking();

    if (document.hidden) {
      return;
    }

    refreshGameStartAccessState();
    updateGameInfo();
  }

  function handleGlobalKeydown(event) {
    if (event.key !== "Escape") {
      return;
    }

    if (state.isMissionOpen) {
      closeMissionModal();
      return;
    }

    closeHelpPanel();
  }

  function handleGlobalClick(event) {
    if (!state.isHelpOpen) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("#helpPanel") || target.closest("#helpToggle")) {
      return;
    }

    closeHelpPanel();
  }

  function toggleHelpPanel() {
    if (state.isHelpOpen) {
      closeHelpPanel();
      return;
    }

    state.isHelpOpen = true;
    if (elements.helpPanel) {
      elements.helpPanel.hidden = false;
    }
    if (elements.helpToggle) {
      elements.helpToggle.setAttribute("aria-expanded", "true");
    }
  }

  function closeHelpPanel() {
    state.isHelpOpen = false;
    if (elements.helpPanel) {
      elements.helpPanel.hidden = true;
    }
    if (elements.helpToggle) {
      elements.helpToggle.setAttribute("aria-expanded", "false");
    }
  }

  async function loadConfig() {
    const configUrl = GAME_CONFIG_DEFAULT_URL;

    try {
      const response = await fetch(configUrl, {
        cache: "no-store",
        headers: { "Cache-Control": "no-store" }
      });

      if (!response.ok) {
        throw new Error("Impossible de charger la configuration de jeu.");
      }

      state.serverClockOffsetMs = resolveServerClockOffsetMs(response.headers.get("Date"));

      const data = await response.json();
      state.config = normalizeConfig(data);
      applyGameBranding();
      updateGameInfo();
    } catch (error) {
      state.serverClockOffsetMs = 0;
      state.config = null;
      clearGameStartUnlockTimer();
      updateGameInfo("Configuration non chargée.");
      setOverviewStatus("Impossible de charger une configuration de jeu valide.", "error");
    }
  }

  function resolveServerClockOffsetMs(serverDateHeader) {
    const headerValue = readOptionalString(serverDateHeader);
    if (!headerValue) {
      return 0;
    }

    const serverDateMs = Date.parse(headerValue);
    if (!Number.isFinite(serverDateMs)) {
      return 0;
    }

    return serverDateMs - Date.now();
  }

  async function toggleFullscreen() {
    if (!document.fullscreenEnabled) {
      setOverviewStatus("Le plein écran n'est pas disponible dans ce navigateur.", "warning");
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      setOverviewStatus("Impossible d'activer le plein écran.", "warning");
    }
  }

  function syncFullscreenButton() {
    if (!elements.fullscreenToggle) {
      return;
    }

    const isFullscreen = Boolean(document.fullscreenElement);

    elements.fullscreenToggle.setAttribute("aria-pressed", isFullscreen ? "true" : "false");
    elements.fullscreenToggle.setAttribute(
      "aria-label",
      isFullscreen ? "Quitter le plein écran" : "Activer le plein écran"
    );
    elements.fullscreenToggle.title = isFullscreen ? "Quitter le plein écran" : "Activer le plein écran";
  }

  function renderMainView() {
    renderHomeContent();
    renderPlacesList();
    updateProgressPill();
    renderOverviewMap();
    switchOverviewTab(resolveInitialOverviewTab());
  }

  function renderHomeContent() {
    if (!elements.homeContent) {
      return;
    }

    if (!state.config) {
      elements.homeContent.innerHTML = '<p class="home-note">Contenu d\'accueil indisponible.</p>';
      return;
    }

    const homeHtml = readOptionalString(state.config.homeHtml);
    if (!homeHtml) {
      elements.homeContent.innerHTML = '<p class="home-note">Contenu d\'accueil non configure.</p>';
      return;
    }

    elements.homeContent.innerHTML = homeHtml;
  }

  function switchOverviewTab(tabName) {
    const normalizedTabName = normalizeOverviewTabName(tabName);
    const activeTab = isOverviewTabAvailable(normalizedTabName) ? normalizedTabName : "home";
    state.activeOverviewTab = activeTab;
    const showHome = activeTab === "home";
    const showMap = activeTab === "map";
    const showPlaces = activeTab === "places";

    if (elements.homePanel) {
      elements.homePanel.hidden = !showHome;
    }

    if (elements.mapPanel) {
      elements.mapPanel.hidden = !showMap;
    }

    if (elements.placesPanel) {
      elements.placesPanel.hidden = !showPlaces;
    }

    if (elements.tabHome) {
      elements.tabHome.classList.toggle("overview-tab--active", showHome);
      elements.tabHome.setAttribute("aria-selected", showHome ? "true" : "false");
    }

    if (elements.tabMap) {
      elements.tabMap.classList.toggle("overview-tab--active", showMap);
      elements.tabMap.setAttribute("aria-selected", showMap ? "true" : "false");
    }

    if (elements.tabPlaces) {
      elements.tabPlaces.classList.toggle("overview-tab--active", showPlaces);
      elements.tabPlaces.setAttribute("aria-selected", showPlaces ? "true" : "false");
    }

    persistOverviewTab(activeTab);
    syncLocationTracking();
    refreshGpsQualityBadge();

    if (showMap) {
      requestInitialOverviewUserPosition();
    }

    if (showMap && state.overviewMapInstance) {
      setTimeout(function () {
        if (state.overviewMapInstance) {
          state.overviewMapInstance.invalidateSize();
        }
      }, 0);
    }
  }

  function normalizeOverviewTabName(tabName) {
    if (OVERVIEW_TABS.includes(tabName)) {
      return tabName;
    }

    return "home";
  }

  function resolveInitialOverviewTab() {
    const savedTab = readLastOverviewTab();
    if (savedTab && isOverviewTabAvailable(savedTab)) {
      return savedTab;
    }

    return "home";
  }

  function isOverviewTabAvailable(tabName) {
    if (tabName === "home") {
      return true;
    }

    return !isGameLockedNow();
  }

  function refreshGameStartAccessState() {
    const locked = isGameLockedNow();

    applyOverviewTabsLockState(locked);

    if (locked && state.activeOverviewTab !== "home") {
      switchOverviewTab("home");
    }

    scheduleGameStartUnlock();
  }

  function applyOverviewTabsLockState(locked) {
    if (elements.overviewTabs) {
      elements.overviewTabs.classList.toggle("overview-tabs--locked", locked);
    }

    if (elements.tabMap) {
      elements.tabMap.hidden = locked;
      elements.tabMap.setAttribute("aria-hidden", locked ? "true" : "false");
    }

    if (elements.tabPlaces) {
      elements.tabPlaces.hidden = locked;
      elements.tabPlaces.setAttribute("aria-hidden", locked ? "true" : "false");
    }
  }

  function resolveGameStartTimestampMs() {
    if (!state.config || !state.config.game) {
      return null;
    }

    const candidate = Number(state.config.game.startAtMs);
    if (!Number.isFinite(candidate)) {
      return null;
    }

    return candidate;
  }

  function getTrustedNowMs() {
    return Date.now() + state.serverClockOffsetMs;
  }

  function isGameLockedNow() {
    const gameStartTimestampMs = resolveGameStartTimestampMs();
    if (!Number.isFinite(gameStartTimestampMs)) {
      return false;
    }

    return getTrustedNowMs() < gameStartTimestampMs;
  }

  function scheduleGameStartUnlock() {
    clearGameStartUnlockTimer();

    const gameStartTimestampMs = resolveGameStartTimestampMs();
    if (!Number.isFinite(gameStartTimestampMs)) {
      return;
    }

    const remainingMs = gameStartTimestampMs - getTrustedNowMs();
    if (remainingMs <= 0) {
      return;
    }

    const delayMs = Math.min(remainingMs, MAX_TIMER_DELAY_MS);

    state.gameUnlockTimerId = setTimeout(function () {
      state.gameUnlockTimerId = null;
      refreshGameStartAccessState();
      updateGameInfo();
    }, delayMs);
  }

  function clearGameStartUnlockTimer() {
    if (state.gameUnlockTimerId === null) {
      return;
    }

    clearTimeout(state.gameUnlockTimerId);
    state.gameUnlockTimerId = null;
  }

  function readLastOverviewTab() {
    const storageKey = resolveOverviewTabStorageKey();

    try {
      const rawValue = localStorage.getItem(storageKey);
      if (OVERVIEW_TABS.includes(rawValue)) {
        return rawValue;
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function persistOverviewTab(tabName) {
    const normalizedTab = normalizeOverviewTabName(tabName);
    const storageKey = resolveOverviewTabStorageKey();

    try {
      localStorage.setItem(storageKey, normalizedTab);
    } catch (error) {
      return;
    }
  }

  function renderOverviewMap() {
    if (!elements.overviewMap) {
      return;
    }

    if (!state.config || !Array.isArray(state.config.zones) || state.config.zones.length === 0) {
      setOverviewStatus("Carte indisponible: configuration invalide.", "error");
      return;
    }

    if (!window.L) {
      setOverviewStatus("Impossible d'afficher la carte dans ce navigateur.", "error");
      return;
    }

    if (!state.overviewMapInstance) {
      state.overviewMapInstance = window.L.map(elements.overviewMap, {
        zoomControl: true,
        attributionControl: true,
        zoomSnap: OVERVIEW_MAP_ZOOM_STEP,
        zoomDelta: OVERVIEW_MAP_ZOOM_STEP,
        maxZoom: OVERVIEW_MAP_MAX_ZOOM,
        wheelPxPerZoomLevel: 120
      });

      const baseMapLayer = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(state.overviewMapInstance);

      state.overviewCycleLayer = window.L.layerGroup().addTo(state.overviewMapInstance);
      loadCycleTracksLayer(state.overviewCycleLayer);

      window.L.control.layers(
        {
          "Fond OSM": baseMapLayer
        },
        {
          "Pistes cyclables": state.overviewCycleLayer
        },
        {
          collapsed: true,
          position: "topright"
        }
      ).addTo(state.overviewMapInstance);

      state.overviewPendingMarkersLayer = window.L.layerGroup().addTo(state.overviewMapInstance);
      state.overviewFoundMarkersLayer = window.L.layerGroup().addTo(state.overviewMapInstance);
      state.overviewUserLayer = window.L.layerGroup().addTo(state.overviewMapInstance);
      fitOverviewMapToZones();

      setTimeout(function () {
        if (state.overviewMapInstance) {
          state.overviewMapInstance.invalidateSize();
        }
      }, 0);
    }

    applyOverviewPoiVisibility();
  }

  function fitOverviewMapToZones() {
    if (!state.overviewMapInstance || !state.config || !Array.isArray(state.config.zones)) {
      return;
    }

    const bounds = state.config.zones.map(function (zone) {
      return [zone.center.lat, zone.center.lng];
    });

    if (bounds.length === 1) {
      state.overviewMapInstance.setView(bounds[0], 14);
      return;
    }

    state.overviewMapInstance.fitBounds(bounds, { padding: [26, 26] });
  }

  async function loadCycleTracksLayer(targetLayer) {
    if (!targetLayer || !state.config || !Array.isArray(state.config.zones) || state.config.zones.length === 0) {
      return;
    }

    targetLayer.clearLayers();

    try {
      const response = await fetch("./data/cycle-routes.osm.json", {
        cache: "force-cache"
      });

      if (!response.ok) {
        throw new Error("Erreur HTTP " + response.status);
      }

      const result = await response.json();
      const elements = Array.isArray(result && result.elements) ? result.elements : [];
      renderCycleTracks(targetLayer, elements);
    } catch (error) {
      console.warn("Impossible de charger les pistes cyclables locales:", error);
      setOverviewStatus("Pistes cyclables indisponibles: donnees locales manquantes.", "warning");
    }
  }

  function renderCycleTracks(targetLayer, elements) {
    if (!targetLayer || !Array.isArray(elements)) {
      return;
    }

    const seenWayIds = new Set();

    elements.forEach(function (element) {
      if (element.type !== "way" || !Array.isArray(element.geometry) || element.geometry.length < 2) {
        return;
      }

      if (seenWayIds.has(element.id)) {
        return;
      }
      seenWayIds.add(element.id);

      const latLngs = element.geometry
        .map(function (point) {
          if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
            return null;
          }

          return [point.lat, point.lon];
        })
        .filter(function (point) {
          return Array.isArray(point);
        });

      if (latLngs.length < 2) {
        return;
      }

      window.L.polyline(latLngs, {
        color: "#16a34a",
        weight: 3,
        opacity: 0.92,
        lineCap: "round",
        lineJoin: "round",
        dashArray: null
      }).addTo(targetLayer);
    });
  }

  function rebuildOverviewMarkers() {
    if (
      !state.overviewPendingMarkersLayer ||
      !state.overviewFoundMarkersLayer ||
      !state.config ||
      !Array.isArray(state.config.zones)
    ) {
      return;
    }

    state.overviewPendingMarkersLayer.clearLayers();
    state.overviewFoundMarkersLayer.clearLayers();

    state.config.zones.forEach(function (zone) {
      const found = isZoneFound(zone.id);
      const marker = window.L.marker([zone.center.lat, zone.center.lng], {
        icon: createOverviewMarkerIcon(found)
      });

      marker.on("click", function () {
        openMissionModal(zone.id);
      });

      marker.bindTooltip(resolveZoneDisplayTitle(zone), {
        direction: "top",
        sticky: true
      });

      marker.addTo(found ? state.overviewFoundMarkersLayer : state.overviewPendingMarkersLayer);
    });
  }

  function createOverviewMarkerIcon(found) {
    const variant = found ? "place-pin--found" : "place-pin--pending";

    return window.L.divIcon({
      className: "place-pin-icon",
      html: '<span class="place-pin-hit"><span class="place-pin ' + variant + '"></span></span>',
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
  }

  function createOverviewUserMarkerIcon() {
    return window.L.divIcon({
      className: "user-location-pin-icon",
      html: '<span class="user-location-pin-hit"><span class="user-location-pin"></span></span>',
      iconSize: [28, 28],
      iconAnchor: [14, 26]
    });
  }

  function applyOverviewPoiVisibility() {
    if (!state.overviewMapInstance || !state.overviewPendingMarkersLayer || !state.overviewFoundMarkersLayer) {
      return;
    }

    rebuildOverviewMarkers();
  }

  function renderPlacesList() {
    if (!elements.placesList) {
      return;
    }

    if (!state.config || !Array.isArray(state.config.zones) || state.config.zones.length === 0) {
      elements.placesList.innerHTML = '<li class="empty-state">Aucun lieu configuré.</li>';
      return;
    }

    elements.placesList.innerHTML = state.config.zones
      .map(function (zone) {
        const found = isZoneFound(zone.id);
        const statusLabel = resolveZoneStatusLabel(zone);
        const zoneTitle = resolveZoneDisplayTitle(zone);
        const zoneSubtitle = found && typeof zone.anecdote === "string" ? zone.anecdote : "";

        return (
          '<li class="place-item ' +
          (found ? "place-item--found" : "place-item--pending") +
          '">' +
          '<button class="place-link" type="button" data-zone-id="' +
          escapeHtml(zone.id) +
          '">' +
          '<span class="place-link__title">' +
          escapeHtml(zoneTitle) +
          "</span>" +
          (zoneSubtitle
            ? '<span class="place-link__subtitle">' + escapeHtml(zoneSubtitle) + "</span>"
            : "") +
          '<span class="place-link__status">' +
          escapeHtml(statusLabel) +
          "</span>" +
          "</button>" +
          "</li>"
        );
      })
      .join("");
  }

  function resolveZoneStatusLabel(zone) {
    const record = getValidationForZone(zone.id);
    if (!record) {
      return "À découvrir";
    }

    if (zone.question && !isRewardUnlockedForZone(zone, record)) {
      return "Lieu validé · question en attente";
    }

    const rewardPresentation = resolveRewardPresentation(zone.reward);
    if (rewardPresentation.variantClass === "no-clue" || rewardPresentation.variantClass === "info") {
      return rewardPresentation.displayRewardText;
    }

    return "Récompense : " + rewardPresentation.displayRewardText;
  }

  function handlePlacesListClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const trigger = target.closest("[data-zone-id]");
    if (!trigger) {
      return;
    }

    const zoneId = trigger.getAttribute("data-zone-id");
    if (!zoneId) {
      return;
    }

    openMissionModal(zoneId);
  }

  function openMissionModal(zoneId) {
    const zone = findZoneById(zoneId);
    if (!zone || !elements.missionModal) {
      return;
    }

    state.selectedZoneId = zone.id;
    state.isMissionOpen = true;
    state.hasPlayedMissionCelebration = false;

    elements.missionModal.hidden = false;
    document.body.classList.add("modal-open");
    clearMissionCelebration();

    renderMissionContent(zone, false);
    closeHelpPanel();
    syncLocationTracking();
  }

  function closeMissionModal() {
    state.isMissionOpen = false;
    state.selectedZoneId = null;
    state.hasPlayedMissionCelebration = false;

    if (elements.missionModal) {
      elements.missionModal.hidden = true;
    }

    clearMissionCelebration();

    document.body.classList.remove("modal-open");
    clearQuestionAnswerInput();
    setMissionStatus("", "warning", false);
    syncLocationTracking();
  }

  function renderMissionContent(zone, preserveStatus) {
    if (!zone) {
      return;
    }

    const found = isZoneFound(zone.id);
    const record = found ? getValidationForZone(zone.id) : null;
    const rewardUnlocked = isRewardUnlockedForZone(zone, record);
    const requiresQuestion = Boolean(zone.question);
    const showQuestionPanel = found && requiresQuestion && !rewardUnlocked;
    const displayTitle = resolveZoneDisplayTitle(zone);

    if (elements.missionMeta) {
      elements.missionMeta.classList.remove("mission-meta--celebration");

      if (!found) {
        elements.missionMeta.textContent = "Lieu à découvrir";
      } else if (showQuestionPanel) {
        elements.missionMeta.textContent = "Lieu validé · question en attente";
      } else {
        elements.missionMeta.textContent = "Félicitations";
        elements.missionMeta.classList.add("mission-meta--celebration");
      }
    }

    if (elements.missionTitle) {
      elements.missionTitle.textContent = displayTitle;
    }

    if (elements.missionAnecdote) {
      if (found && zone.anecdote) {
        elements.missionAnecdote.textContent = zone.anecdote;
        elements.missionAnecdote.style.display = "block";
      } else {
        elements.missionAnecdote.textContent = "";
        elements.missionAnecdote.style.display = "none";
      }
    }

    if (elements.missionHint) {
      elements.missionHint.hidden = found;
      elements.missionHint.textContent = found ? "" : zone.hint;
    }

    if (elements.questionPanel) {
      elements.questionPanel.hidden = !showQuestionPanel;
    }

    if (elements.questionPrompt) {
      elements.questionPrompt.textContent = showQuestionPanel ? zone.question.prompt : "";
    }

    if (elements.geolocationButton) {
      elements.geolocationButton.hidden = found;
      elements.geolocationButton.disabled = found || state.isLoadingValidation;
      elements.geolocationButton.textContent = "Valider ce lieu";
    }

    if (found && rewardUnlocked) {
      triggerMissionCelebration();
      setMissionStatus(buildRewardStatusHtml(zone), resolveRewardNoticeVariant(zone), true);
    } else if (found && showQuestionPanel) {
      if (!preserveStatus) {
        setMissionStatus("Lieu validé. Répondez à la question pour débloquer la récompense.", "warning", false);
      }
    } else if (!preserveStatus) {
      setMissionStatus("", "warning", false);
    }
  }

  function clearQuestionAnswerInput() {
    if (elements.questionAnswer) {
      elements.questionAnswer.value = "";
    }
  }

  function requestInitialOverviewUserPosition() {
    if (state.activeOverviewTab !== "map" || state.isLocatingOnOverview) {
      return;
    }

    if (!state.config || !navigator.geolocation || !window.isSecureContext) {
      return;
    }

    setOverviewLocateBusy(true);

    (async function () {
      try {
        syncLocationTracking();
        const position = await resolveBestAvailableOverviewPosition();

        if (!position) {
          return;
        }

        handleTrackedPosition(position, { forceRender: true });
        centerOverviewMapOnPosition(position);
      } catch (error) {
        return;
      } finally {
        setOverviewLocateBusy(false);
      }
    })();
  }

  async function resolveBestAvailableOverviewPosition() {
    let position = resolvePreferredUserPosition(GEO_TRACKING_RECENTER_MAX_AGE_MS);

    if (!position) {
      try {
        position = await getCurrentPosition({
          enableHighAccuracy: false,
          timeout: GEO_TRACKING_RECENTER_TIMEOUT_MS,
          maximumAge: GEO_TRACKING_RECENTER_FALLBACK_MAX_AGE_MS
        });
      } catch (error) {
        if (!isGeolocationTimeoutError(error)) {
          throw error;
        }
      }
    }

    if (!position && state.lastKnownPosition) {
      position = state.lastKnownPosition;
    }

    return position;
  }

  function syncLocationTracking() {
    if (!state.config || !navigator.geolocation || !window.isSecureContext || document.hidden) {
      stopLocationTracking();
      return;
    }

    const desiredMode = resolveLocationTrackingMode();

    if (desiredMode === "off") {
      stopLocationTracking();
      return;
    }

    if (state.locationWatchId !== null && state.locationWatchMode === desiredMode) {
      return;
    }

    stopLocationTracking();
    startLocationTracking(desiredMode);
  }

  function resolveLocationTrackingMode() {
    if (state.isMissionOpen || state.activeOverviewTab === "map") {
      return "precise";
    }

    return "off";
  }

  function startLocationTracking(mode) {
    const options = GEO_TRACKING_OPTIONS[mode] || GEO_TRACKING_OPTIONS.precise;

    try {
      state.locationWatchId = navigator.geolocation.watchPosition(
        function (position) {
          handleTrackedPosition(position);
        },
        function (error) {
          handleTrackedPositionError(error);
        },
        options
      );
      state.locationWatchMode = mode;
    } catch (error) {
      setOverviewStatus("Impossible d'activer le suivi GPS automatique.", "warning");
    }
  }

  function stopLocationTracking() {
    if (state.locationWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(state.locationWatchId);
    }

    state.locationWatchId = null;
    state.locationWatchMode = "";
    refreshGpsQualityBadge();
  }

  function handleTrackedPosition(position, options) {
    const settings = options || {};
    const forceRender = Boolean(settings.forceRender);

    state.lastKnownPosition = position;
    refreshGpsQualityBadge();
    clearOverviewTransientGeolocationStatus();

    if (shouldAutoValidateOnLiveTracking()) {
      validateNearbyZoneFromOverviewPosition(position);
    }

    if (!shouldRenderTrackedPosition(position, forceRender)) {
      return;
    }

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = Number(position.coords.accuracy);

    renderOverviewUserPosition(position);
    state.lastRenderedPosition = {
      lat: lat,
      lng: lng,
      accuracy: Number.isFinite(accuracy) ? accuracy : null
    };
    state.lastUserPositionRenderAt = Date.now();

    maybeAutoCenterOverviewMap(position, forceRender);
  }

  function maybeAutoCenterOverviewMap(position, forceRender) {
    if (forceRender || state.activeOverviewTab !== "map" || state.isMissionOpen) {
      return;
    }

    if (!state.overviewMapInstance || !position || !position.coords) {
      return;
    }

    const now = Date.now();
    if (now - state.lastAutoCenterAt < OVERVIEW_AUTO_RECENTER_MIN_INTERVAL_MS) {
      return;
    }

    const nextAutoCenter = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };

    if (!state.lastAutoCenterPosition) {
      rememberAutoCenterPosition(nextAutoCenter, now);
      return;
    }

    const movedDistance = haversineDistance(nextAutoCenter, state.lastAutoCenterPosition);
    if (movedDistance < OVERVIEW_AUTO_RECENTER_MIN_MOVE_METERS) {
      state.autoCenterMovementDetections = 0;
      return;
    }

    state.autoCenterMovementDetections += 1;
    if (state.autoCenterMovementDetections < OVERVIEW_AUTO_RECENTER_REQUIRED_UPDATES) {
      return;
    }

    state.overviewMapInstance.panTo([nextAutoCenter.lat, nextAutoCenter.lng], {
      animate: true,
      duration: OVERVIEW_AUTO_RECENTER_ANIMATION_SECONDS
    });
    rememberAutoCenterPosition(nextAutoCenter, now);
    state.autoCenterMovementDetections = 0;
  }

  function rememberAutoCenterPosition(position, timestamp) {
    if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) {
      return;
    }

    state.lastAutoCenterPosition = {
      lat: position.lat,
      lng: position.lng
    };
    state.lastAutoCenterAt = Number.isFinite(timestamp) ? timestamp : Date.now();
    state.autoCenterMovementDetections = 0;
  }

  function shouldRenderTrackedPosition(position, forceRender) {
    if (forceRender || !state.lastRenderedPosition) {
      return true;
    }

    const now = Date.now();
    if (now - state.lastUserPositionRenderAt >= GEO_TRACKING_MAX_RENDER_INTERVAL_MS) {
      return true;
    }

    const nextPosition = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    const distance = haversineDistance(nextPosition, state.lastRenderedPosition);

    if (distance >= GEO_TRACKING_MIN_RENDER_DISTANCE_METERS) {
      return true;
    }

    const previousAccuracy = Number(state.lastRenderedPosition.accuracy);
    const nextAccuracy = Number(position.coords.accuracy);

    if (Number.isFinite(previousAccuracy) && Number.isFinite(nextAccuracy)) {
      return Math.abs(previousAccuracy - nextAccuracy) >= 10;
    }

    return false;
  }

  function shouldAutoValidateOnLiveTracking() {
    return state.activeOverviewTab === "map" && !state.isMissionOpen;
  }

  function getFreshTrackedPosition(maxAgeMs) {
    if (!state.lastKnownPosition) {
      return null;
    }

    const timestamp = Number(state.lastKnownPosition.timestamp);
    if (!Number.isFinite(timestamp)) {
      return state.lastKnownPosition;
    }

    if (Date.now() - timestamp <= maxAgeMs) {
      return state.lastKnownPosition;
    }

    return null;
  }

  function handleTrackedPositionError(error) {
    const normalizedError = handleGeolocationError(error);

    if (error && error.code === error.PERMISSION_DENIED) {
      stopLocationTracking();
    }

    if (!isSilentOverviewGeolocationError(normalizedError)) {
      setOverviewStatus(normalizedError.message, resolveStatusVariant(normalizedError.message));
    }

    refreshGpsQualityBadge();
  }

  function isSilentOverviewGeolocationError(error) {
    const message = String((error && error.message) || "").toLowerCase();

    if (isGeolocationTimeoutError(error)) {
      return true;
    }

    return message.includes("position actuelle indisponible");
  }

  function clearOverviewTransientGeolocationStatus() {
    if (!elements.overviewStatusBox || elements.overviewStatusBox.hidden) {
      return;
    }

    const currentMessage = String(elements.overviewStatusBox.textContent || "").toLowerCase();
    const isTransientMessage =
      currentMessage.includes("position actuelle indisponible") ||
      currentMessage.includes("delai de geolocalisation") ||
      currentMessage.includes("délai de géolocalisation");

    if (isTransientMessage) {
      setOverviewStatus("", "warning");
    }
  }

  function refreshGpsQualityBadge() {
    if (!elements.gpsQualityBadge) {
      return;
    }

    if (state.activeOverviewTab !== "map") {
      renderGpsQualityBadge(null);
      return;
    }

    renderGpsQualityBadge(resolveGpsQualityInfo(resolvePreferredUserPosition(GEO_TRACKING_RECENTER_FALLBACK_MAX_AGE_MS)));
  }

  function resolveGpsQualityInfo(position) {
    const fallbackInfo = {
      key: "red",
      label: "faible",
      accuracy: null
    };

    if (!position || !position.coords) {
      return fallbackInfo;
    }

    const accuracy = Number(position.coords.accuracy);
    if (!Number.isFinite(accuracy) || accuracy <= 0) {
      return fallbackInfo;
    }

    const timestamp = Number(position.timestamp);
    if (Number.isFinite(timestamp) && Date.now() - timestamp > GPS_QUALITY_MAX_AGE_MS) {
      return fallbackInfo;
    }

    if (accuracy <= GPS_QUALITY_GREEN_MAX_ACCURACY_METERS) {
      return { key: "green", label: "bonne", accuracy: accuracy };
    }

    if (accuracy <= GPS_QUALITY_YELLOW_MAX_ACCURACY_METERS) {
      return { key: "yellow", label: "moyenne", accuracy: accuracy };
    }

    return { key: "red", label: "faible", accuracy: accuracy };
  }

  function renderGpsQualityBadge(info) {
    if (!elements.gpsQualityBadge) {
      return;
    }

    const badge = elements.gpsQualityBadge;
    ensureGpsQualityBadgeMarkup(badge);

    if (info === null) {
      badge.hidden = true;
      badge.title = "";
      badge.className = "gps-quality-badge";
      badge.setAttribute("aria-label", "Qualite GPS indisponible");
      return;
    }

    const quality = info || { key: "red", label: "faible", accuracy: null };
    badge.className = "gps-quality-badge gps-quality-badge--" + quality.key;

    const roundedAccuracy = Number.isFinite(quality.accuracy) ? Math.round(quality.accuracy) : null;
    const accuracyPart = roundedAccuracy !== null ? " (±" + roundedAccuracy + " m)" : "";
    badge.hidden = false;
    badge.title = "Qualite GPS " + quality.label + accuracyPart;
    badge.setAttribute("aria-label", "Qualite GPS " + quality.label + accuracyPart);
  }

  function ensureGpsQualityBadgeMarkup(badge) {
    if (!(badge instanceof Element)) {
      return;
    }

    if (badge.querySelector(".gps-quality-badge__bars")) {
      return;
    }

    badge.innerHTML =
      '<span class="gps-quality-badge__bars" aria-hidden="true">' +
      '<span class="gps-quality-badge__bar gps-quality-badge__bar--1"></span>' +
      '<span class="gps-quality-badge__bar gps-quality-badge__bar--2"></span>' +
      '<span class="gps-quality-badge__bar gps-quality-badge__bar--3"></span>' +
      '<span class="gps-quality-badge__bar gps-quality-badge__bar--4"></span>' +
      "</span>" +
      '<span class="gps-quality-badge__label">GPS</span>';
  }

  function centerOverviewMapOnPosition(position) {
    if (!state.overviewMapInstance || !position || !position.coords) {
      return;
    }

    const currentZoom = state.overviewMapInstance.getZoom();
    const nextZoom = Math.min(Math.max(currentZoom, 13), OVERVIEW_MAP_MAX_ZOOM);

    state.overviewMapInstance.setView(
      [position.coords.latitude, position.coords.longitude],
      nextZoom
    );

    rememberAutoCenterPosition(
      {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      },
      Date.now()
    );
  }

  function getDisplayedUserPosition() {
    if (!state.lastRenderedPosition) {
      return null;
    }

    const accuracy = Number(state.lastRenderedPosition.accuracy);

    return {
      coords: {
        latitude: state.lastRenderedPosition.lat,
        longitude: state.lastRenderedPosition.lng,
        accuracy: Number.isFinite(accuracy) ? accuracy : null
      },
      timestamp: state.lastUserPositionRenderAt
    };
  }

  function resolvePreferredUserPosition(maxAgeMs) {
    const displayedPosition = getDisplayedUserPosition();
    if (displayedPosition) {
      return displayedPosition;
    }

    return getFreshTrackedPosition(maxAgeMs);
  }

  function isGeolocationTimeoutError(error) {
    if (!error) {
      return false;
    }

    if (error.geoCode === 3) {
      return true;
    }

    const message = String(error.message || "").toLowerCase();
    return message.includes("delai") || message.includes("délai");
  }

  function renderOverviewUserPosition(position) {
    if (!state.overviewUserLayer || !window.L) {
      return;
    }

    state.overviewUserLayer.clearLayers();

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    window.L.marker([lat, lng], {
      icon: createOverviewUserMarkerIcon(),
      zIndexOffset: 1000
    }).addTo(state.overviewUserLayer);
  }

  function validateNearbyZoneFromOverviewPosition(position) {
    if (!position || !position.coords || !state.config || !Array.isArray(state.config.zones)) {
      return null;
    }

    const attemptPosition = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: Number(position.coords.accuracy)
    };

    const defaultRadius = state.config.game ? state.config.game.defaultRadiusMeter : null;
    let closestMatch = null;

    state.config.zones.forEach(function (zone) {
      if (!zone || !zone.id || hasExistingValidation(zone.id)) {
        return;
      }

      const distanceMeters = haversineDistance(attemptPosition, zone.center);
      const zoneRadius = resolveZoneRadius(zone, defaultRadius);

      if (distanceMeters > zoneRadius) {
        return;
      }

      if (!closestMatch || distanceMeters < closestMatch.distanceMeters) {
        closestMatch = {
          zone: zone,
          distanceMeters: distanceMeters
        };
      }
    });

    if (!closestMatch) {
      return null;
    }

    const validation = validateAttemptForZone(attemptPosition, closestMatch.zone, defaultRadius);
    renderPlacesList();
    updateProgressPill();
    rebuildOverviewMarkers();

    if (!state.isMissionOpen || state.selectedZoneId !== validation.zone.id) {
      openMissionModal(validation.zone.id);
    }

    renderMissionValidationResult(validation);
    renderMissionContent(validation.zone, true);

    return validation;
  }

  async function handleMissionValidation() {
    if (state.isLoadingValidation) {
      return;
    }

    if (!state.config) {
      setMissionStatus("La configuration du jeu n'est pas disponible.", "error", false);
      return;
    }

    const selectedZone = getSelectedZone();
    if (!selectedZone) {
      setMissionStatus("Choisissez un lieu avant de lancer la géolocalisation.", "warning", false);
      return;
    }

    if (!navigator.geolocation) {
      setMissionStatus("La géolocalisation navigateur n'est pas disponible sur cet appareil.", "error", false);
      return;
    }

    if (!window.isSecureContext) {
      setMissionStatus("La géolocalisation navigateur exige une page HTTPS.", "error", false);
      return;
    }

    if (hasExistingValidation(selectedZone.id)) {
      renderMissionContent(selectedZone, false);
      return;
    }

    setValidationBusy(true);
    setMissionStatus("Récupération de votre position actuelle...", "warning", false);

    try {
      syncLocationTracking();

      let position = resolvePreferredUserPosition(GEO_TRACKING_RECENTER_FALLBACK_MAX_AGE_MS);

      if (!position) {
        try {
          position = await getCurrentPosition({
            enableHighAccuracy: false,
            timeout: GEO_TRACKING_RECENTER_TIMEOUT_MS,
            maximumAge: GEO_TRACKING_RECENTER_FALLBACK_MAX_AGE_MS
          });
        } catch (error) {
          if (!isGeolocationTimeoutError(error)) {
            throw error;
          }
        }
      }

      if (!position && state.lastKnownPosition) {
        position = state.lastKnownPosition;
      }

      if (!position) {
        throw new Error("Position actuelle indisponible.");
      }

      handleTrackedPosition(position, { forceRender: true });

      const validation = validateAttemptForZone(
        {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        },
        selectedZone,
        state.config.game.defaultRadiusMeter
      );

      renderMissionValidationResult(validation);
      renderPlacesList();
      updateProgressPill();
      rebuildOverviewMarkers();

      renderMissionContent(validation.zone, true);
    } catch (error) {
      setMissionStatus(error.message || "Validation impossible.", resolveStatusVariant(error.message), false);
    } finally {
      setValidationBusy(false);
    }
  }

  function handleQuestionSubmit() {
    const selectedZone = getSelectedZone();
    if (!selectedZone || !selectedZone.question) {
      return;
    }

    const record = getValidationForZone(selectedZone.id);
    if (!record) {
      setMissionStatus("Validez d'abord ce lieu avant de répondre.", "warning", false);
      return;
    }

    if (isRewardUnlockedForZone(selectedZone, record)) {
      renderMissionContent(selectedZone, false);
      return;
    }

    const answer = elements.questionAnswer ? elements.questionAnswer.value.trim() : "";
    const result = evaluateQuestionAnswer(selectedZone.question, answer);

    if (!result.valid) {
      setMissionStatus(result.message, "warning", false);
      return;
    }

    updateValidationForZone(selectedZone.id, {
      rewardUnlocked: true,
      questionAnswered: true,
      questionAnswer: answer,
      questionAnsweredAt: new Date().toISOString()
    });

    clearQuestionAnswerInput();
    renderPlacesList();
    renderMissionContent(selectedZone, false);
  }

  function evaluateQuestionAnswer(question, answer) {
    if (!question) {
      return { valid: true, message: "" };
    }

    if (!answer) {
      return { valid: false, message: "Réponse vide. Merci de saisir une réponse." };
    }

    if (question.mode === "exact") {
      if (answer === question.exactAnswer) {
        return { valid: true, message: "" };
      }

      return { valid: false, message: "Ce n'est pas la réponse attendue." };
    }

    const wordCount = countWords(answer);
    if (wordCount >= question.minWords) {
      return { valid: true, message: "" };
    }

    return {
      valid: false,
      message: "Réponse trop courte. Il faut au moins " + question.minWords + " mot(s)."
    };
  }

  function countWords(value) {
    return String(value)
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  function validateAttemptForZone(position, zone, defaultRadiusMeter) {
    const zoneRadius = resolveZoneRadius(zone, defaultRadiusMeter);
    const distanceMeters = haversineDistance(position, zone.center);

    if (distanceMeters > zoneRadius) {
      if (distanceMeters > FAR_HINT_THRESHOLD_METERS) {
        throw new Error("Vous êtes encore loin de ce lieu.");
      }

      throw new Error("Vous vous rapprochez.");
    }

    const record = {
      zoneId: zone.id,
      zoneHint: zone.hint,
      zoneName: zone.name || "",
      reward: zone.reward,
      rewardUnlocked: !zone.question,
      questionAnswered: !zone.question,
      distanceMeters: distanceMeters,
      accuracyMeters: Number.isFinite(position.accuracy) ? position.accuracy : null,
      validatedAt: new Date().toISOString(),
      source: "Géolocalisation navigateur"
    };

    saveValidation(record);
    playPoiFoundSound();

    return {
      zone: zone,
      record: record
    };
  }

  function renderMissionValidationResult(validation) {
    if (validation.record && validation.record.rewardUnlocked) {
      setMissionStatus(
        buildRewardStatusHtml(validation.zone),
        resolveRewardNoticeVariant(validation.zone),
        true
      );
      return;
    }

    setMissionStatus("Lieu validé. Répondez à la question pour débloquer la récompense.", "warning", false);
  }

  function triggerMissionCelebration() {
    if (!elements.missionPanel || state.hasPlayedMissionCelebration) {
      return;
    }

    state.hasPlayedMissionCelebration = true;
    clearMissionCelebration();

    void elements.missionPanel.offsetWidth;
    elements.missionPanel.classList.add("mission-modal__panel--celebrating");
    state.missionCelebrationTimerId = setTimeout(function () {
      clearMissionCelebration();
    }, 1600);
  }

  function clearMissionCelebration() {
    if (state.missionCelebrationTimerId) {
      clearTimeout(state.missionCelebrationTimerId);
      state.missionCelebrationTimerId = null;
    }

    if (elements.missionPanel) {
      elements.missionPanel.classList.remove("mission-modal__panel--celebrating");
    }
  }

  function playPoiFoundSound() {
    if (typeof window.Audio !== "function") {
      return;
    }

    try {
      const audio = new Audio(POI_FOUND_SOUND_FILE);
      audio.preload = "auto";
      audio.volume = POI_FOUND_SOUND_VOLUME;

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(function () {
          return;
        });
      }
    } catch (error) {
      return;
    }
  }

  function buildRewardStatusHtml(zone) {
    const rewardPresentation = resolveRewardPresentation(zone.reward);
    const rewardText = escapeHtml(rewardPresentation.displayRewardText);
    const rewardTitleMarkup =
      rewardPresentation.variantClass === "no-clue"
        ? '<p class="reward-title"><strong>' + rewardText + "</strong></p>"
        : '<p class="reward-title">' +
          escapeHtml(rewardPresentation.title) +
          " : <strong>" +
          rewardText +
          "</strong></p>";

    return (
      '<div class="reward-celebration reward-celebration--' +
      rewardPresentation.variantClass +
      '">' +
      '<span class="reward-icon" aria-hidden="true">' +
      buildRewardIconMarkup(rewardPresentation.variantClass) +
      "</span>" +
      '<div class="reward-copy">' +
      rewardTitleMarkup +
      "</div>" +
      "</div>"
    );
  }

  function buildRewardIconMarkup(variantClass) {
    if (variantClass === "photo") {
      return '<span class="reward-icon__emoji">📷</span>';
    }

    if (variantClass === "info") {
      return '<span class="reward-icon__emoji">📍</span>';
    }

    if (variantClass === "no-clue") {
      return '<span class="reward-icon__emoji">👎</span>';
    }

    const iconUrl = REWARD_ICON_FILE;

    if (typeof iconUrl === "string" && iconUrl.trim()) {
      return (
        '<img class="reward-icon__image" src="' +
        escapeHtml(iconUrl.trim()) +
        '" alt="" onerror="this.outerHTML=\'<span class=&quot;reward-icon__emoji&quot;>👍</span>\'">'
      );
    }

    return '<span class="reward-icon__emoji">👍</span>';
  }

  function resolveRewardPresentation(reward) {
    const normalizedReward = normalizeRewardForDisplay(reward);

    if (normalizedReward.type === REWARD_TYPE_DEFIPHOTO) {
      return {
        variantClass: "photo",
        title: "Défi Photo",
        displayRewardText: buildPhotoChallengePrompt(normalizedReward.value)
      };
    }

    if (normalizedReward.type === REWARD_TYPE_NOTHING) {
      if (normalizedReward.value) {
        return {
          variantClass: "info",
          title: GPS_TEST_REWARD_TITLE,
          displayRewardText: normalizedReward.value
        };
      }

      return {
        variantClass: "no-clue",
        title: "Pas d'indice",
        displayRewardText: NO_CLUE_REWARD_TEXT
      };
    }

    return {
      variantClass: "clue",
      title: "Récompense trouvée",
      displayRewardText: normalizedReward.value
    };
  }

  function normalizeRewardForDisplay(rawReward) {
    if (rawReward && typeof rawReward === "object" && !Array.isArray(rawReward)) {
      const rewardType = String(rawReward.type || "").trim().toUpperCase();

      if (rewardType === REWARD_TYPE_NOTHING) {
        return {
          type: REWARD_TYPE_NOTHING,
          value: String(rawReward.message || "").trim()
        };
      }

      if (rewardType === REWARD_TYPE_DEFIPHOTO) {
        const rawPhotoValue = rawReward.value !== undefined ? rawReward.value : rawReward.title;
        const challengeTitle = extractPhotoChallengeTitle(rawPhotoValue) || String(rawPhotoValue || "").trim();

        return {
          type: REWARD_TYPE_DEFIPHOTO,
          value: challengeTitle
        };
      }

      if (rewardType === REWARD_TYPE_REWARD) {
        return {
          type: REWARD_TYPE_REWARD,
          value: String(rawReward.value || "").trim()
        };
      }
    }

    try {
      return normalizeLegacyRewardDefinition(String(formatReward(rawReward || "")).trim(), "reward");
    } catch (error) {
      return {
        type: REWARD_TYPE_NOTHING,
        value: ""
      };
    }
  }

  function normalizeLooseText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[’]/g, "'")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function isSolutionFragmentRewardText(rewardText) {
    return /^\s*\d+\s*=/.test(String(rewardText || ""));
  }

  function extractPhotoChallengeTitle(rewardText) {
    let challengeText = String(rewardText || "").trim();
    if (!challengeText) {
      return "";
    }

    if (normalizeLooseText(challengeText).startsWith(PHOTO_CHALLENGE_PREFIX)) {
      const colonIndex = challengeText.indexOf(":");
      if (colonIndex >= 0) {
        challengeText = challengeText.slice(colonIndex + 1).trim();
      }
    }

    if (normalizeLooseText(challengeText).startsWith(PHOTO_CHALLENGE_PROMPT_PREFIX)) {
      challengeText = challengeText.slice(PHOTO_CHALLENGE_PROMPT_PREFIX.length).trim();
    }

    return trimWrappingQuotes(challengeText);
  }

  function trimWrappingQuotes(value) {
    const text = String(value || "").trim();
    if (text.length < 2) {
      return text;
    }

    const first = text.charAt(0);
    const last = text.charAt(text.length - 1);
    const hasMatchingQuotes =
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === "“" && last === "”") ||
      (first === "«" && last === "»");

    if (!hasMatchingQuotes) {
      return text;
    }

    return text.slice(1, -1).trim();
  }

  function buildPhotoChallengePrompt(challengeTitle) {
    return 'Prenez une photo dont le titre serait "' + String(challengeTitle || "").trim() + '"';
  }

  function resolveRewardNoticeVariant(zone) {
    const presentation = resolveRewardPresentation(zone ? zone.reward : "");

    if (presentation.variantClass === "photo") {
      return "info";
    }

    if (presentation.variantClass === "no-clue") {
      return "warning";
    }

    return "success";
  }

  function handleGeolocationError(error) {
    const errorCode = error && typeof error.code === "number" ? error.code : null;

    function createGeolocationError(message) {
      const normalizedError = new Error(message);
      if (errorCode !== null) {
        normalizedError.geoCode = errorCode;
      }

      return normalizedError;
    }

    if (error && error.code === error.PERMISSION_DENIED) {
      return createGeolocationError(buildPermissionDeniedMessage());
    }

    if (error && error.code === error.POSITION_UNAVAILABLE) {
      return createGeolocationError("Position actuelle indisponible.");
    }

    if (error && error.code === error.TIMEOUT) {
      return createGeolocationError("Le délai de géolocalisation a expiré.");
    }

    return createGeolocationError("Impossible de récupérer la position actuelle.");
  }

  function getCurrentPosition(options) {
    const geolocationOptions = Object.assign(
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 3000
      },
      options || {}
    );

    return new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(
        resolve,
        function (error) {
          reject(handleGeolocationError(error));
        },
        geolocationOptions
      );
    });
  }

  function resolveZoneDisplayTitle(zone) {
    if (isZoneFound(zone.id) && typeof zone.name === "string" && zone.name.trim()) {
      return zone.name.trim();
    }

    return zone.hint;
  }

  function findZoneById(zoneId) {
    if (!state.config || !Array.isArray(state.config.zones)) {
      return null;
    }

    return (
      state.config.zones.find(function (zone) {
        return zone.id === zoneId;
      }) || null
    );
  }

  function getSelectedZone() {
    if (!state.selectedZoneId) {
      return null;
    }

    return findZoneById(state.selectedZoneId);
  }

  function updateProgressPill() {
    if (!elements.progressPill || !state.config || !Array.isArray(state.config.zones)) {
      return;
    }

    const validatedCount = getValidatedZoneIds().size;
    const totalCount = state.config.zones.length;
    const baseProgress = validatedCount + " / " + totalCount;
    const isLandscape = window.matchMedia && window.matchMedia("(orientation: landscape)").matches;
    elements.progressPill.textContent = isLandscape ? baseProgress : baseProgress + " trouvés";
  }

  function resolveZoneRadius(zone, defaultRadiusMeter) {
    const candidate = Number(zone && zone.radiusMeters);
    if (Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }

    return Number(defaultRadiusMeter);
  }

  function hasExistingValidation(zoneId) {
    return getValidations().some(function (record) {
      return record.zoneId === zoneId;
    });
  }

  function getValidationForZone(zoneId) {
    return (
      getValidations().find(function (record) {
        return record.zoneId === zoneId;
      }) || null
    );
  }

  function isRewardUnlockedForZone(zone, record) {
    if (!zone) {
      return false;
    }

    if (!zone.question) {
      return true;
    }

    if (!record) {
      return false;
    }

    if (typeof record.rewardUnlocked === "boolean") {
      return record.rewardUnlocked;
    }

    return true;
  }

  function isZoneFound(zoneId) {
    return getValidatedZoneIds().has(zoneId);
  }

  function getValidatedZoneIds() {
    const zoneIds = new Set();

    getValidations().forEach(function (record) {
      if (record && record.zoneId) {
        zoneIds.add(record.zoneId);
      }
    });

    return zoneIds;
  }

  function saveValidation(record) {
    upsertValidationRecord(record);
  }

  function updateValidationForZone(zoneId, updates) {
    const current = getValidationForZone(zoneId);
    if (!current) {
      return null;
    }

    const nextRecord = Object.assign({}, current, updates || {});
    upsertValidationRecord(nextRecord);
    return nextRecord;
  }

  function upsertValidationRecord(record) {
    if (!record || !record.zoneId) {
      return;
    }

    const storageKey = requireStorageKey();
    const store = readStore();
    const existingIndex = store.findIndex(function (entry) {
      return entry && entry.zoneId === record.zoneId;
    });

    if (existingIndex >= 0) {
      store[existingIndex] = Object.assign({}, store[existingIndex], record);
    } else {
      store.push(record);
    }

    localStorage.setItem(storageKey, JSON.stringify(store));
  }

  function getValidations() {
    return readStore();
  }

  function readStore() {
    try {
      const storageKey = resolveStorageKey();
      if (!storageKey) {
        return [];
      }

      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        return parsed;
      }

      if (parsed && typeof parsed === "object") {
        const flattened = Object.values(parsed)
          .filter(Array.isArray)
          .flat();

        const dedupByZone = [];
        const seen = new Set();

        flattened.forEach(function (record) {
          if (!record || !record.zoneId || seen.has(record.zoneId)) {
            return;
          }

          seen.add(record.zoneId);
          dedupByZone.push(record);
        });

        return dedupByZone;
      }

      return [];
    } catch (error) {
      return [];
    }
  }

  function setValidationBusy(isBusy) {
    state.isLoadingValidation = isBusy;

    if (elements.geolocationButton) {
      const selectedZone = getSelectedZone();
      const alreadyFound = selectedZone ? isZoneFound(selectedZone.id) : false;
      elements.geolocationButton.disabled = isBusy || alreadyFound;
    }
  }

  function setOverviewLocateBusy(isBusy) {
    state.isLocatingOnOverview = isBusy;
  }

  function setOverviewStatus(message, variant, allowHtml) {
    setNotice(elements.overviewStatusBox, message, variant, allowHtml);
  }

  function setMissionStatus(message, variant, allowHtml) {
    setNotice(elements.missionStatusBox, message, variant, allowHtml);
  }

  function setNotice(targetElement, message, variant, allowHtml) {
    if (!targetElement) {
      return;
    }

    if (!message) {
      targetElement.hidden = true;
      targetElement.textContent = "";
      targetElement.className = "notice";
      return;
    }

    if (allowHtml) {
      targetElement.innerHTML = message;
    } else {
      targetElement.textContent = message;
    }

    targetElement.hidden = false;
    targetElement.className = "notice";

    if (variant === "error") {
      targetElement.classList.add("notice--error");
    } else if (variant === "warning") {
      targetElement.classList.add("notice--warning");
    } else if (variant === "success") {
      targetElement.classList.add("notice--success");
    } else if (variant === "info") {
      targetElement.classList.add("notice--info");
    }
  }

  function resolveStatusVariant(message) {
    const normalized = String(message || "").toLowerCase();

    if (
      normalized.includes("refusee") ||
      normalized.includes("refusée") ||
      normalized.includes("deja valide") ||
      normalized.includes("déjà validé") ||
      normalized.includes("rapprochez") ||
      normalized.includes("loin")
    ) {
      return "warning";
    }

    return "error";
  }

  function applyGameBranding() {
    const branding = state.config && state.config.branding ? state.config.branding : null;
    const gameName =
      state.config && state.config.game && state.config.game.name
        ? readOptionalString(state.config.game.name)
        : "";
    const siteTitle = branding && branding.siteTitle ? branding.siteTitle : INITIAL_SITE_TITLE;
    const siteLogo = branding && branding.siteLogo ? branding.siteLogo : INITIAL_SITE_LOGO_SRC;
    const pageTitle = gameName || siteTitle;

    if (elements.siteLogo) {
      elements.siteLogo.src = siteLogo;
    }

    if (elements.siteName) {
      elements.siteName.textContent = siteTitle;
    }

    document.title = pageTitle;
  }

  function updateGameInfo(extraMessage) {
    if (!elements.gameInfo) {
      return;
    }

    if (!state.config) {
      elements.gameInfo.textContent = "Configuration du jeu indisponible.";
      return;
    }

    let message =
      state.config.game.name +
      " · " +
      state.config.zones.length +
      " lieu(x) · rayon " +
      Math.round(state.config.game.defaultRadiusMeter) +
      " m · mode géolocalisation";

    if (isGameLockedNow()) {
      const gameStartTimestampMs = resolveGameStartTimestampMs();
      if (Number.isFinite(gameStartTimestampMs)) {
        message += " · ouverture " + formatParisDateTime(gameStartTimestampMs);
      }
    }

    if (state.config.game.version) {
      message += " · version " + state.config.game.version;
    }

    if (extraMessage) {
      message += " · " + extraMessage;
    }

    elements.gameInfo.textContent = message;
  }

  function normalizeConfig(rawConfig) {
    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
      throw new Error("Configuration invalide: objet racine attendu.");
    }

    const gameConfig = rawConfig.game;
    const mapConfig = rawConfig.map;
    const rawZones = rawConfig.zones;

    if (!gameConfig || typeof gameConfig !== "object" || Array.isArray(gameConfig)) {
      throw new Error("Configuration invalide: game doit etre un objet.");
    }

    if (!Array.isArray(rawZones) || rawZones.length === 0) {
      throw new Error("Configuration invalide: zones doit etre un tableau non vide.");
    }

    if (mapConfig !== undefined && (!mapConfig || typeof mapConfig !== "object" || Array.isArray(mapConfig))) {
      throw new Error("Configuration invalide: map doit etre un objet si present.");
    }

    const normalizedMap = mapConfig || {};
    const gridMeters = readOptionalPositiveNumber(normalizedMap.gridMeters, "map.gridMeters");
    const gridDegLegacy = readOptionalPositiveNumber(normalizedMap.gridDeg, "map.gridDeg");
    const gameStartAt = readOptionalString(gameConfig.startAt);
    const homeHtml = normalizeOptionalHomeHtml(rawConfig.homeHtml);

    return {
      game: {
        id: requireNonEmptyString(gameConfig.id, "game.id"),
        name: requireNonEmptyString(gameConfig.name, "game.name"),
        version: readOptionalString(gameConfig.version),
        startAt: gameStartAt,
        startAtMs: parseOptionalDateTimeMs(gameStartAt, "game.startAt"),
        defaultRadiusMeter: requirePositiveNumber(gameConfig.defaultRadiusMeter, "game.defaultRadiusMeter")
      },
      map: {
        gridMeters: gridMeters || (gridDegLegacy ? gridDegLegacy * 111320 : 2200)
      },
      branding: normalizeBrandingConfig(rawConfig.branding, gameConfig.name),
      homeHtml: homeHtml,
      zones: rawZones.map(function (zone, index) {
        if (!zone || typeof zone !== "object" || Array.isArray(zone)) {
          throw new Error("Configuration invalide: zones[" + index + "] doit etre un objet.");
        }

        const center = zone.center;
        if (!center || typeof center !== "object" || Array.isArray(center)) {
          throw new Error("Configuration invalide: zones[" + index + "].center doit etre un objet.");
        }

        const lat = requireNumber(center.lat, "zones[" + index + "].center.lat");
        const lng = requireNumber(center.lng, "zones[" + index + "].center.lng");
        const zoneRadius = readOptionalPositiveNumber(zone.radiusMeters, "zones[" + index + "].radiusMeters");
        const anecdote = readOptionalString(zone.anecdote);
        const question = normalizeOptionalQuestion(zone.question, index);

        if (!Object.prototype.hasOwnProperty.call(zone, "reward") || zone.reward === null) {
          throw new Error("Configuration invalide: zones[" + index + "].reward est obligatoire.");
        }

        const reward = normalizeRewardDefinition(zone.reward, index);

        const rawHint = typeof zone.hint === "string" && zone.hint.trim() ? zone.hint : zone.label;

        return {
          id: requireNonEmptyString(zone.id, "zones[" + index + "].id"),
          hint: requireNonEmptyString(rawHint, "zones[" + index + "].hint"),
          name: readOptionalString(zone.name),
          center: { lat: lat, lng: lng },
          reward: reward,
          anecdote: anecdote,
          question: question,
          radiusMeters: zoneRadius
        };
      })
    };
  }

  function normalizeBrandingConfig(rawBranding, fallbackTitle) {
    const resolvedFallbackTitle = readOptionalString(fallbackTitle) || INITIAL_SITE_TITLE;

    if (rawBranding === undefined || rawBranding === null || rawBranding === "") {
      return {
        siteTitle: resolvedFallbackTitle,
        siteLogo: INITIAL_SITE_LOGO_SRC
      };
    }

    if (typeof rawBranding !== "object" || Array.isArray(rawBranding)) {
      throw new Error("Configuration invalide: branding doit etre un objet si present.");
    }

    const siteTitle = readOptionalString(rawBranding.siteTitle) || resolvedFallbackTitle;
    const siteLogo = readOptionalString(rawBranding.siteLogo) || INITIAL_SITE_LOGO_SRC;

    if (/^javascript:/i.test(siteLogo)) {
      throw new Error("Configuration invalide: branding.siteLogo ne peut pas utiliser le schema javascript:.");
    }

    return {
      siteTitle: siteTitle,
      siteLogo: siteLogo
    };
  }

  function normalizeOptionalHomeHtml(rawHomeHtml) {
    if (rawHomeHtml === undefined || rawHomeHtml === null || rawHomeHtml === "") {
      return "";
    }

    if (typeof rawHomeHtml !== "string") {
      throw new Error("Configuration invalide: homeHtml doit etre une chaine HTML si present.");
    }

    return rawHomeHtml.trim();
  }

  function normalizeOptionalQuestion(rawQuestion, zoneIndex) {
    if (rawQuestion === undefined || rawQuestion === null || rawQuestion === "") {
      return null;
    }

    if (typeof rawQuestion !== "object" || Array.isArray(rawQuestion)) {
      throw new Error("Configuration invalide: zones[" + zoneIndex + "].question doit etre un objet.");
    }

    const prompt = requireNonEmptyString(
      rawQuestion.prompt || rawQuestion.label,
      "zones[" + zoneIndex + "].question.prompt"
    );

    const answerCandidate = rawQuestion.exactAnswer !== undefined ? rawQuestion.exactAnswer : rawQuestion.answer;
    const hasExactAnswer = answerCandidate !== undefined && answerCandidate !== null && String(answerCandidate).trim() !== "";
    const exactAnswer = hasExactAnswer
      ? requireNonEmptyString(answerCandidate, "zones[" + zoneIndex + "].question.exactAnswer")
      : "";

    const minWords = readOptionalPositiveInteger(
      rawQuestion.minWords !== undefined ? rawQuestion.minWords : rawQuestion.minWordCount,
      "zones[" + zoneIndex + "].question.minWords"
    );

    if (hasExactAnswer && minWords !== null) {
      throw new Error(
        "Configuration invalide: zones[" + zoneIndex + "].question ne peut pas combiner exactAnswer et minWords."
      );
    }

    if (!hasExactAnswer && minWords === null) {
      throw new Error(
        "Configuration invalide: zones[" + zoneIndex + "].question doit definir exactAnswer (ou answer) ou minWords."
      );
    }

    if (hasExactAnswer) {
      return {
        prompt: prompt,
        mode: "exact",
        exactAnswer: exactAnswer
      };
    }

    return {
      prompt: prompt,
      mode: "minWords",
      minWords: minWords
    };
  }

  function normalizeRewardDefinition(rawReward, zoneIndex) {
    const fieldPath = "zones[" + zoneIndex + "].reward";

    if (rawReward && typeof rawReward === "object" && !Array.isArray(rawReward)) {
      const rewardType = requireNonEmptyString(rawReward.type, fieldPath + ".type").toUpperCase();

      if (rewardType === REWARD_TYPE_REWARD) {
        return {
          type: REWARD_TYPE_REWARD,
          value: requireNonEmptyString(rawReward.value, fieldPath + ".value")
        };
      }

      if (rewardType === REWARD_TYPE_DEFIPHOTO) {
        const rawPhotoValue = rawReward.value !== undefined ? rawReward.value : rawReward.title;
        const challengeTitle = extractPhotoChallengeTitle(rawPhotoValue) || String(rawPhotoValue || "").trim();

        return {
          type: REWARD_TYPE_DEFIPHOTO,
          value: requireNonEmptyString(challengeTitle, fieldPath + ".value")
        };
      }

      if (rewardType === REWARD_TYPE_NOTHING) {
        const message = readOptionalString(rawReward.message);
        return {
          type: REWARD_TYPE_NOTHING,
          message: message
        };
      }

      throw new Error(
        fieldPath +
          ".type est invalide. Valeurs attendues: " +
          REWARD_TYPE_REWARD +
          ", " +
          REWARD_TYPE_DEFIPHOTO +
          ", " +
          REWARD_TYPE_NOTHING +
          "."
      );
    }

    if (typeof rawReward === "string") {
      return normalizeLegacyRewardDefinition(rawReward, fieldPath);
    }

    throw new Error(fieldPath + " doit etre une chaine (legacy) ou un objet { type, value }.");
  }

  function normalizeLegacyRewardDefinition(rawReward, fieldPath) {
    const rewardText = requireNonEmptyString(rawReward, fieldPath);
    const normalizedRewardText = normalizeLooseText(rewardText);
    const normalizedNoClueRewardText = normalizeLooseText(NO_CLUE_REWARD_TEXT);

    if (normalizedRewardText === normalizedNoClueRewardText) {
      return {
        type: REWARD_TYPE_NOTHING
      };
    }

    if (isSolutionFragmentRewardText(rewardText)) {
      return {
        type: REWARD_TYPE_REWARD,
        value: rewardText
      };
    }

    return {
      type: REWARD_TYPE_DEFIPHOTO,
      value: requireNonEmptyString(extractPhotoChallengeTitle(rewardText) || rewardText, fieldPath)
    };
  }

  function buildPermissionDeniedMessage() {
    const platform = detectMobilePlatform();

    if (platform === "android") {
      return (
        "Permission de géolocalisation refusée. Android: ouvrez les paramètres du navigateur, " +
        "section site/page, puis Position > Autoriser. Rechargez ensuite la page."
      );
    }

    if (platform === "ios") {
      return (
        "Permission de géolocalisation refusée. iPhone: Réglages > Safari > Localisation > Autoriser, " +
        "puis revenez sur la page et rechargez-la."
      );
    }

    return "Permission de géolocalisation refusée. Autorisez la localisation dans le navigateur puis rechargez la page.";
  }

  function detectMobilePlatform() {
    const userAgent = navigator.userAgent || "";

    if (/android/i.test(userAgent)) {
      return "android";
    }

    if (/iphone|ipad|ipod/i.test(userAgent)) {
      return "ios";
    }

    return "other";
  }

  function formatReward(reward) {
    if (typeof reward === "string") {
      return reward;
    }

    return JSON.stringify(reward);
  }

  function haversineDistance(from, to) {
    const earthRadiusMeters = 6371000;
    const lat1 = toRadians(from.lat);
    const lat2 = toRadians(to.lat);
    const deltaLat = toRadians(to.lat - from.lat);
    const deltaLng = toRadians(to.lng - from.lng);

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusMeters * c;
  }

  function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  function resolveStorageKey() {
    if (!state.config || !state.config.game || !state.config.game.id) {
      return null;
    }

    const rawId = String(state.config.game.id).trim();
    if (!rawId) {
      return null;
    }

    return STORAGE_KEY_PREFIX + rawId;
  }

  function resolveOverviewTabStorageKey() {
    const storageKey = resolveStorageKey();
    if (storageKey) {
      return storageKey + "_last_overview_tab";
    }

    return STORAGE_KEY_PREFIX + "last_overview_tab";
  }

  function requireStorageKey() {
    const storageKey = resolveStorageKey();
    if (!storageKey) {
      throw new Error("Identifiant de jeu manquant: impossible de sauvegarder.");
    }

    return storageKey;
  }

  function requireNonEmptyString(value, fieldName) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("Configuration invalide: " + fieldName + " est obligatoire.");
    }

    return value.trim();
  }

  function readOptionalString(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim();
  }

  function requirePositiveNumber(value, fieldName) {
    const candidate = Number(value);
    if (!Number.isFinite(candidate) || candidate <= 0) {
      throw new Error("Configuration invalide: " + fieldName + " doit etre un nombre strictement positif.");
    }

    return candidate;
  }

  function readOptionalPositiveNumber(value, fieldName) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const candidate = Number(value);
    if (!Number.isFinite(candidate) || candidate <= 0) {
      throw new Error("Configuration invalide: " + fieldName + " doit etre un nombre strictement positif.");
    }

    return candidate;
  }

  function readOptionalPositiveInteger(value, fieldName) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const candidate = Number(value);
    if (!Number.isInteger(candidate) || candidate < 1) {
      throw new Error("Configuration invalide: " + fieldName + " doit etre un entier strictement positif.");
    }

    return candidate;
  }

  function parseOptionalDateTimeMs(value, fieldName) {
    const rawValue = readOptionalString(value);
    if (!rawValue) {
      return null;
    }

    const timestampMs = Date.parse(rawValue);
    if (!Number.isFinite(timestampMs)) {
      throw new Error("Configuration invalide: " + fieldName + " doit etre une date ISO 8601 valide.");
    }

    return timestampMs;
  }

  function formatParisDateTime(timestampMs) {
    try {
      return new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Paris"
      }).format(new Date(timestampMs));
    } catch (error) {
      return new Date(timestampMs).toISOString();
    }
  }

  function requireNumber(value, fieldName) {
    const candidate = Number(value);
    if (!Number.isFinite(candidate)) {
      throw new Error("Configuration invalide: " + fieldName + " doit etre un nombre.");
    }

    return candidate;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();

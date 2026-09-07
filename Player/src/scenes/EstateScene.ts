import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, SceneKey } from '@/config/gameConfig';
import { getGameState } from '@/state/registry';
import type { GameState } from '@/state/GameState';
import { getAssetIndex } from '@/bundle/registry';
import type { GalleryMediaRef } from '@/bundle/spec/bundle/galleryDoc';
import { resolveTunable } from '@/bundle/spec/bundle/minigameDoc';
import {
  actOnEstate, estateBathGuests, estateBathPercent, estateSpriteBounds, estateInvitationRoom, estateInviteGroup, estateRoomMembers, commissionBoard, commissionQuote, CREWS, estateCapacity,
  estateRoomBackground, estateRoomEnabled, estateRoomCapacity, estateRoomResidents, estateSceneEnabled, estateWorkdayOpen, readEstateState, settleWorkday,
  type EstateAction, type EstateCalendar, type EstateMinigame, type EstateResident, type EstateRoom, type EstateState, type EstateTutorialStep,
} from '@/bundle/spec/bundle/estate';
import { registerFocusable, setControllerActions } from '@/input/FocusNavigation';
import { estateButton, estatePanel, ESTATE_COLORS as C, type EstateControl } from '@/ui/EstateUI';

type Page = 'villa' | 'room' | 'bath' | 'commissions' | 'gates';

/** The floor plan is the navigation; each illustrated room is a destination. */
export class EstateScene extends Phaser.Scene {
  private state!: GameState;
  private definition!: EstateMinigame;
  private ledger!: EstateState;
  private launchData!: { name: string; mode: 'story' | 'test' };
  private page: Page = 'villa';
  private roomKey = '';
  private resident: string | null = null;
  private detailPage = 0;
  private listingPage = 0;
  private farewell = false;
  private note = '';
  private stipend = 18;
  private bonus = 0;
  private closed = false;
  private controls: EstateControl[] = [];
  private focused = -1;
  private testGates = new Map<string, boolean>();
  private gatePage = 0;
  /** The story's calendar, when it owns the day. Story mode only: a test has no story to read. */
  private calendar: EstateCalendar | null = null;
  /** Set by one Return pressed on an unstaffed day; a second confirms the idle day. */
  private leaving = false;
  private tutorialStep = -1;
  private tutorialReturn: { page: Page; room: string; resident: string | null; detail: number; note: string } | null = null;
  private crownEditor: Phaser.GameObjects.DOMElement | null = null;
  private crownField: HTMLInputElement | null = null;
  private crownLabel: Phaser.GameObjects.Text | null = null;

  constructor() { super(SceneKey.Estate); }

  create(data: { name: string; mode: 'story' | 'test' }): void {
    this.launchData = data; this.state = getGameState(this);
    this.page = 'villa'; this.resident = null; this.roomKey = '';
    this.detailPage = 0; this.listingPage = 0; this.farewell = false;
    this.closed = false; this.note = ''; this.controls = []; this.focused = -1;
    this.testGates = new Map(); this.gatePage = 0; this.calendar = null; this.leaving = false;
    this.tutorialStep = -1; this.tutorialReturn = null;
    this.crownEditor = null; this.crownField = null; this.crownLabel = null;
    this.cameras.main.setBackgroundColor('#152820');
    try {
      const game = this.state.bundle.minigames.minigames.find(one => one.name === data.name);
      if (!game || game.kind !== 'estate') throw new Error('This villa is not in the minigame catalogue.');
      this.definition = game;
      if (data.mode === 'story' && (typeof this.state.engine.getVariable(game.stateVariable) !== 'string' ||
          typeof this.state.engine.getVariable(game.resultVariable) !== 'string' || game.stateVariable === game.resultVariable)) {
        throw new Error('The villa needs separate text variables for its ledger and result.');
      }
      const stat = (name: string): number => this.state.stats.get(name);
      this.stipend = resolveTunable(game.dailyStipend, stat, 1, 10000);
      this.bonus = resolveTunable(game.commissionBonus, stat, 0, 12);
      const savedLedger = data.mode === 'test' ? '' : this.state.engine.getVariable(game.stateVariable);
      this.ledger = readEstateState(savedLedger,
        resolveTunable(game.startingFunds, stat, 0, 100000), game.rooms);
      if (data.mode === 'story') {
        if (!game.calendar) throw new Error('Choose the story day and settled-day variables in the villa’s Ledger tab.');
        this.calendar = game.calendar;
        this.syncCalendar(savedLedger !== '');
      }
      this.roomKey = this.visibleRooms().find(room => room.beds && this.ledger.rooms.includes(room.key))?.key ?? this.visibleRooms()[0]?.key ?? '';
      this.persist();
      if (game.tutorial?.autoStart && (this.ledger.tutorialSeen ?? 0) < game.tutorial.version) this.startTutorial();
      else this.render();
    } catch (error) {
      estatePanel(this, 200, 180, 880, 330);
      this.text(240, 215, 'The estate ledger', 30, C.cream, 790, true);
      this.text(240, 280, error instanceof Error ? error.message : String(error), 21, '#e3b7a2', 790);
      this.button(640, 440, 'Return', () => this.finish());
    }
    const keyboard = this.input.keyboard;
    const keydown = (event: KeyboardEvent): void => {
      if (['Tab', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        if (!this.controls.length) return;
        this.controls[this.focused]?.focus(false);
        const backwards = event.shiftKey || event.key === 'ArrowLeft' || event.key === 'ArrowUp';
        this.focused = this.focused < 0 ? (backwards ? this.controls.length - 1 : 0) : (this.focused + (backwards ? -1 : 1) + this.controls.length) % this.controls.length;
        this.controls[this.focused]?.focus(true);
      } else if (event.key === 'Enter' || event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) this.controls[this.focused]?.activate();
      } else if (event.key === 'Escape' && !event.repeat) this.back();
    };
    keyboard?.on('keydown', keydown);
    setControllerActions(this, { back: () => this.back(), accept: () => { if (this.tutorialStep >= 0) this.moveTutorial(1); },
      previousPage: () => this.tutorialStep >= 0 ? this.moveTutorial(-1) : this.stepRoom(-1),
      nextPage: () => this.tutorialStep >= 0 ? this.moveTutorial(1) : this.stepRoom(1) });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.closeCrownEditor(false); keyboard?.off('keydown', keydown); });
  }

  private number(variable: string): number | null {
    const value = this.state.engine.getVariable(variable);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  /** Re-read Ink on every launch; only test mode is allowed to advance its own clock. */
  private syncCalendar(hadLedger: boolean): void {
    if (!this.calendar) return;
    const day = this.number(this.calendar.day);
    if (day === null || !Number.isSafeInteger(day) || day < 1) throw new Error('The story day must be a positive whole number before opening the villa.');
    if (day !== this.ledger.day) {
      // Ink may end a day without reopening the evening board. Pay the actual
      // saved workday once, not every skipped day, before replacing its draft.
      if (hadLedger && day > this.ledger.day && this.settledDay() < this.ledger.day) {
        const paid = settleWorkday(this.ledger, this.ledger.day, this.definition, this.stipend, this.bonus)
          ?? settleWorkday({ ...this.ledger, selected: [] }, this.ledger.day, this.definition, this.stipend, this.bonus);
        if (paid) { this.ledger = paid.state; this.state.engine.setVariable(this.calendar.settled, this.ledger.day); }
      }
      this.ledger = { ...this.ledger, day, selected: [] };
    }
    this.settleIfDue();
  }
  /** The last day the calendar paid, or -1 when nothing owns the day. */
  private settledDay(): number { return this.calendar ? (this.number(this.calendar.settled) ?? 0) : -1; }
  /** Under a calendar, today's work is paid once; afterwards the board is closed until tomorrow. */
  private workFinished(): boolean { return this.calendar !== null && !estateWorkdayOpen(this.calendar, this.ledger.day); }
  private boardLocked(): boolean { return this.calendar !== null && (this.workFinished() || this.settledDay() >= this.ledger.day); }
  /**
   * Pays the calendar day's work, once.
   *
   * The story says when by holding the phase variable at the agreed value,
   * and the settled-day variable is what makes it once: a save loaded during
   * the same evening finds it already equal to the day and pays nothing
   * again. A draft the day cannot staff is dropped and the day pays its
   * stipend, rather than paying for work that could not have happened.
   */
  private settleIfDue(): void {
    const calendar = this.calendar; if (!calendar) return;
    const day = this.number(calendar.day); if (day === null || !estateWorkdayOpen(calendar, day)) return;
    const due = !calendar.when || this.state.engine.getVariable(calendar.when.variable) === calendar.when.value;
    if (!due || this.settledDay() >= day) return;
    const paid = settleWorkday(this.ledger, day, this.definition, this.stipend, this.bonus)
      ?? settleWorkday({ ...this.ledger, selected: [] }, day, this.definition, this.stipend, this.bonus);
    if (!paid) return;
    this.ledger = paid.state;
    this.state.engine.setVariable(calendar.settled, day);
    this.persist();
    this.note = 'Day ' + day + ' paid: stipend ' + paid.stipend + (paid.commissions ? ', commissions ' + paid.commissions : '') +
      (paid.bonus ? ', your standing ' + paid.bonus : '') + '. ' + paid.income + ' crowns in all.';
  }
  private eligible = (variable: string): boolean => this.launchData.mode === 'test' || this.state.engine.getVariable(variable) === true;
  private roomVariable = (variable: string): boolean => this.launchData.mode === 'test' && this.testGates.has(variable)
    ? this.testGates.get(variable) === true : this.state.engine.getVariable(variable) === true;
  private roomEnabled = (room: EstateRoom): boolean => estateRoomEnabled(room, this.roomVariable);
  private visibleRooms(): EstateRoom[] { return this.definition.rooms.filter(this.roomEnabled); }
  private persist(): void {
    if (this.launchData.mode === 'story') this.state.engine.setVariable(this.definition.stateVariable, JSON.stringify(this.ledger));
  }
  private act(action: EstateAction): void {
    if (this.closed || this.tutorialStep >= 0) return;
    if (action.kind === 'settle' && this.launchData.mode !== 'test') return;
    this.leaving = false;
    // Under a calendar the story pays and advances; the board only takes pins, and only until it is paid.
    if (this.calendar && (action.kind === 'settle' || (action.kind === 'contract' && this.boardLocked()))) return;
    const next = actOnEstate(this.ledger, action, this.definition, this.eligible, this.stipend, this.bonus, this.roomVariable);
    if (next === this.ledger) return;
    this.ledger = next; this.persist();
    if (action.kind === 'scene') {
      if (this.launchData.mode === 'story') { this.finish(action.result); return; }
      this.note = 'Test scene: ' + action.result + '. Story mode opens the authored scene.';
    } else if (action.kind === 'settle') this.note = 'Day ' + (next.day - 1) + ' complete · ' + next.lastIncome + ' crowns received. New notices have arrived.';
    else if (action.kind === 'invite') { this.note = 'Invitation accepted. Welcome home.'; this.resident = action.key; this.detailPage = 0; }
    else if (action.kind === 'farewell') { this.note = 'Her home stays reserved. You may invite her back.'; this.resident = null; this.farewell = false; }
    else if (action.kind === 'restore') this.note = 'Restored · A little more of the villa comes to life.';
    else this.note = '';
    this.render();
  }
  private finish(result = 'return'): void {
    if (this.closed || this.tutorialStep >= 0) return;
    // Warned, not forbidden: an idle day is allowed, but not by accident.
    if (result === 'return' && this.calendar && !this.boardLocked() && this.ledger.selected.length === 0 && !this.leaving) {
      this.leaving = true;
      this.note = 'No notices pinned: the crews will idle today. Return again to leave anyway, or pin notices first.';
      this.render(); return;
    }
    this.closed = true;
    if (this.launchData.mode === 'story') {
      if (this.definition && typeof this.state.engine.getVariable(this.definition.resultVariable) === 'string') this.state.engine.setVariable(this.definition.resultVariable, result);
      this.state.refresh(); this.scene.resume(SceneKey.VN); this.scene.stop();
    } else this.scene.start(SceneKey.MainMenu);
  }
  private back(): void {
    if (this.tutorialStep >= 0) { this.endTutorial(); return; }
    if (this.farewell) { this.farewell = false; this.render(); }
    else if (this.page === 'bath') this.openRoom(this.roomKey);
    else if (this.page !== 'villa') this.navigate('villa');
    else this.finish();
  }
  private navigate(page: Page): void { if (this.tutorialStep >= 0) return; this.page = page; this.farewell = false; this.note = ''; this.render(); }
  private currentRoom(): EstateRoom | undefined { return this.visibleRooms().find(one => one.key === this.roomKey) ?? this.visibleRooms()[0]; }
  private openRoom(key: string, enter = true): void {
    if (this.tutorialStep >= 0) return;
    if (!this.visibleRooms().some(room => room.key === key)) return;
    this.roomKey = key; this.detailPage = 0; this.farewell = false; this.note = '';
    this.resident = estateRoomResidents(this.ledger, key)[0] ?? null;
    if (enter) this.page = 'room';
    this.render();
  }
  private stepRoom(offset: number): void {
    if (this.tutorialStep >= 0 || !this.definition || this.page === 'bath' || this.page === 'commissions' || this.page === 'gates') return;
    const rooms = this.visibleRooms(), index = rooms.findIndex(one => one.key === this.roomKey);
    const room = rooms[index + offset];
    if (room) this.openRoom(room.key, this.page === 'room');
  }
  private art(ref?: GalleryMediaRef | null): string | null {
    const result = ref && getAssetIndex(this).resolveRef(ref);
    return result && this.textures.exists(result.key) ? result.key : null;
  }
  private imageIn(key: string, x: number, y: number, width: number, height: number): Phaser.GameObjects.Image {
    const image = this.add.image(x + width / 2, y + height / 2, key);
    const scale = Math.max(width / image.width, height / image.height);
    image.setScale(scale).setCrop((image.width - width / scale) / 2, (image.height - height / scale) / 2, width / scale, height / scale);
    return image;
  }
  private render(): void {
    this.closeCrownEditor(false);
    this.children.removeAll(true); this.controls = []; this.focused = -1;
    const room = this.currentRoom();
    this.roomKey = room?.key ?? '';
    if (this.page === 'room' && !room) this.page = 'villa';
    if (this.page === 'bath' && (!room?.sharedBaths || !this.ledger.rooms.includes(room.key))) this.page = room ? 'room' : 'villa';
    const background = this.page === 'bath' && room ? this.art(room.bathingBackground ?? room.background) : this.page === 'room' && room ? this.art(estateRoomBackground(room, this.ledger)) : this.page === 'commissions' ? this.art(this.definition.noticeboardBackground) : null;
    if (background) {
      this.imageIn(background, 0, 0, GAME_WIDTH, GAME_HEIGHT);
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x182018, this.page === 'room' ? 0.08 : 0.15).setOrigin(0);
    } else {
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x1e3025).setOrigin(0);
      const g = this.add.graphics().lineStyle(1, 0xa89260, 0.055);
      for (let x = -720; x < 1400; x += 50) g.lineBetween(x, 0, x + 720, 720);
    }
    // Bath portraits are intentionally drawn before the header so a native-size
    // crop can extend behind the chrome without covering its controls.
    if (this.page !== 'bath') this.header();
    if (this.page === 'villa') this.villa();
    else if (this.page === 'room') this.roomInterior();
    else if (this.page === 'bath' && room) this.bathInterior(room);
    else if (this.page === 'commissions') this.commissions();
    else this.roomGates();
    if (this.page === 'bath') this.header();
    this.add.rectangle(0, 674, 1280, 46, 0x101d17, 0.96).setOrigin(0);
    const boardNote = !this.calendar ? 'Choose your commissions, then collect the day’s earnings.'
      : this.workFinished() ? 'Commissions are finished. Your crowns remain available for rooms and visits.'
      : this.boardLocked() ? 'Today’s work is paid. New notices arrive tomorrow.' : 'Pin notices now. The crews work while you are out, and pay arrives at dusk.';
    this.text(26, 683, this.note || (this.page === 'bath' ? 'Warm water, familiar company. Stay a while.' : this.page === 'gates' ? 'Test only · These switches never change story variables or saves.' : this.page === 'villa' ? 'A house becomes a home, one room at a time.' : this.page === 'room' ? 'Every room has a story of its own.' : boardNote), 16, '#e1cca3', 860, true);
    this.text(930, 685, 'Arrows / Tab · Enter     D-pad · A     Esc / B', 12, C.muted, 330);
    if (this.tutorialStep >= 0) this.drawTutorial();
  }
  private header(): void {
    this.add.rectangle(0, 0, 1280, 125, 0x12251d, 0.97).setOrigin(0);
    const g = this.add.graphics().lineStyle(1, C.gold, 0.7);
    g.lineBetween(24, 123, 1256, 123).strokeCircle(52, 44, 22).strokeCircle(52, 44, 18);
    g.fillStyle(C.gold).fillTriangle(40, 41, 44, 54, 51, 47).fillTriangle(51, 47, 59, 54, 64, 41).fillTriangle(45, 47, 52, 32, 59, 47).fillRect(44, 54, 15, 3);
    this.text(87, 15, 'N O B L E   Q U A R T E R', 11, '#cfb883');
    this.text(86, 35, this.definition.display || 'The villa', 30, C.cream, 490, true);
    const remaining = this.calendar?.lastDay ? this.calendar.lastDay - this.ledger.day : null;
    this.text(634, 23, 'DAY ' + String(this.ledger.day).padStart(2, '0') + (remaining === null ? '' : remaining > 0 ? ' / ' + remaining + ' LEFT' : ' / LAST DAY'), 13, '#c6b58f');
    const crowns = this.text(634, 47, this.ledger.crowns + ' crowns', 24, '#f2d598', 230, true);
    this.crownLabel = crowns;
    if (this.launchData.mode === 'test' && this.tutorialStep < 0) {
      crowns.setInteractive({ useHandCursor: true })
        .on('pointerover', () => crowns.setColor('#ffe9b4'))
        .on('pointerout', () => crowns.setColor('#f2d598'))
        .on('pointerdown', () => this.editCrowns(crowns));
    }
    this.text(888, 24, 'AT HOME', 11, '#c6b58f');
    const visibleResidents = this.ledger.residents.filter(key => this.visibleRooms().some(room => room.key === this.ledger.assignments[key]));
    this.text(888, 47, visibleResidents.length + ' / ' + estateCapacity(this.ledger, this.definition.rooms, this.roomVariable), 24, C.cream, 100, true);
    this.button(1180, 45, 'Return', () => this.finish(), true, 145, false, true);
    this.button(115, 98, 'The villa', () => this.navigate('villa'), true, 174, this.page !== 'commissions', true, 34);
    this.button(307, 98, 'Notice board', () => this.navigate('commissions'), true, 184, this.page === 'commissions', true, 34);
    if (this.page === 'room' || this.page === 'bath') this.text(424, 90, 'VILLA  /  ' + (this.currentRoom()?.name ?? 'Room'), 13, '#ceb98f', 345);
    if (this.definition.tutorial) this.button(838, 98, 'Tutorial', () => this.startTutorial(), true, 116, false, true, 30);
    if (this.launchData.mode === 'test') {
      this.text(914, 91, 'TEST', 11, '#ddc891');
      if (this.definition.rooms.some(room => room.availabilityVariable)) this.button(1037, 98, 'Room gates', () => this.navigate('gates'), true, 132, this.page === 'gates', true, 30);
      this.button(1180, 98, 'Reset test', () => this.scene.restart(this.launchData), true, 145, false, true, 30);
    }
  }
  /** A test-only native field; story funds remain exclusively game-driven. */
  private editCrowns(label: Phaser.GameObjects.Text): void {
    if (this.launchData.mode !== 'test' || this.tutorialStep >= 0 || this.crownEditor) return;
    const input = document.createElement('input');
    input.type = 'text'; input.inputMode = 'numeric'; input.value = String(this.ledger.crowns);
    input.maxLength = 16; input.autocomplete = 'off'; input.spellcheck = false;
    input.setAttribute('aria-label', 'Test crowns');
    input.style.cssText = 'width:230px;height:34px;box-sizing:border-box;padding:1px 8px;pointer-events:auto;' +
      'background:rgba(18,37,29,.98);border:1px solid #c9a86c;border-radius:3px;color:#f2d598;' +
      'font:700 24px Georgia,serif;line-height:30px;outline:none;caret-color:#ffe9b4;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.45);';
    label.setVisible(false); this.crownLabel = label; this.crownField = input;
    const editor = this.add.dom(634, 44, input).setOrigin(0, 0); this.crownEditor = editor;
    input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.closeCrownEditor(true); return; }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const raw = input.value.trim(), value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
      if (!Number.isSafeInteger(value) || value < 0) {
        input.setAttribute('aria-invalid', 'true'); input.style.borderColor = '#db7d68'; input.select(); return;
      }
      this.ledger = { ...this.ledger, crowns: value };
      this.note = `Test crowns set to ${value}.`;
      this.closeCrownEditor(false); this.render();
    });
    input.addEventListener('blur', () => { if (this.crownEditor === editor) this.closeCrownEditor(true); });
    queueMicrotask(() => { if (this.crownField === input) { input.focus(); input.select(); } });
  }
  private closeCrownEditor(restoreLabel: boolean): void {
    const editor = this.crownEditor, label = this.crownLabel;
    this.crownEditor = null; this.crownField = null; this.crownLabel = null;
    if (editor) editor.destroy();
    if (restoreLabel && label?.active) { label.setVisible(true); this.crownLabel = label; }
  }
  private villa(): void {
    const key = this.art(this.definition.background);
    if (key && this.definition.rooms.some(room => room.bounds)) this.floorPlan(key);
    else this.roomCards();
    this.roomPreview();
  }
  private invitations(room: string): EstateResident[] {
    const home = this.definition.rooms.find(one => one.key === room);
    return this.definition.residents.filter(one => (!home?.inviteTogether || one.key === home.residentKey) &&
      !!estateInvitationRoom(this.ledger, this.definition, one.key, room, this.eligible, this.roomVariable));
  }
  private guestNames(keys: string[]): string { return keys.map(key => this.definition.residents.find(one => one.key === key)?.name ?? key).join(' + '); }
  private invitationName(room: EstateRoom, guest: EstateResident): string { return this.guestNames(estateInviteGroup(room, guest.key)); }
  private floorPlan(texture: string): void {
    const size = this.definition.floorPlanSize, scale = Math.min(916 / size.width, 516 / size.height);
    const left = 20 + (916 - size.width * scale) / 2, top = 142 + (516 - size.height * scale) / 2;
    estatePanel(this, 17, 139, 922, 522);
    this.add.image(left, top, texture).setOrigin(0).setDisplaySize(size.width * scale, size.height * scale);
    for (const room of this.definition.rooms) {
      if (!room.bounds) continue;
      const x = left + room.bounds.x * scale, y = top + room.bounds.y * scale;
      const w = room.bounds.width * scale, h = room.bounds.height * scale;
      if (!this.roomEnabled(room)) {
        const empty = this.art(this.definition.disabledFloorPlan);
        if (empty) {
          const layer = this.add.image(left, top, empty).setOrigin(0);
          const sx = layer.width / size.width, sy = layer.height / size.height;
          layer.setDisplaySize(size.width * scale, size.height * scale)
            .setCrop((room.bounds.x - room.bounds.width / 2) * sx, (room.bounds.y - room.bounds.height / 2) * sy, room.bounds.width * sx, room.bounds.height * sy);
        } else {
          this.add.rectangle(x, y, w, h, 0xc4b49a);
          const tiles = this.add.graphics().lineStyle(1, 0x9b8d78, 0.3);
          for (let dx = -w / 2; dx < w / 2; dx += 12) tiles.lineBetween(x + dx, y - h / 2, x + dx, y + h / 2);
          for (let dy = -h / 2; dy < h / 2; dy += 12) tiles.lineBetween(x - w / 2, y + dy, x + w / 2, y + dy);
        }
        continue;
      }
      const owned = this.ledger.rooms.includes(room.key);
      const area = this.add.rectangle(x, y, w, h, 0xe7e3d5, owned ? 0 : 0.74), selected = this.roomKey === room.key;
      area.setStrokeStyle(selected ? 2 : 1, selected ? 0xffdc8e : owned ? 0xa3b180 : 0x8d8978, selected ? 1 : 0.65);
      const target = this.add.container(x, y).setSize(w, h).setInteractive({ useHandCursor: true });
      const focus = (lit: boolean): void => { if (area.active) area.setStrokeStyle(lit || selected ? 2 : 1, lit ? 0xffedb1 : selected ? 0xffdc8e : 0xa3b180, 1); };
      const activate = (): void => this.openRoom(room.key);
      target.on('pointerdown', activate).on('pointerover', () => focus(true)).on('pointerout', () => focus(false));
      registerFocusable(this, { object: target, activate, onFocus: focus }); this.controls.push({ object: target, activate, focus });
      const name = this.guestNames(estateRoomMembers(room)) || room.name;
      const label = this.add.text(x, y - h / 2 + 2, name, { fontFamily: 'Georgia, serif', fontSize: '12px', color: '#f5e9cc', backgroundColor: '#253424', padding: { x: 4, y: 2 } }).setOrigin(0.5, 0);
      if (label.width > w - 4) label.setScale((w - 4) / label.width);
      const occupants = estateRoomResidents(this.ledger, room.key);
      occupants.forEach((resident, i) => {
        const person = this.definition.residents.find(one => one.key === resident);
        if (!person) return;
        const px = x - w / 2 + w / occupants.length * (i + 0.5);
        const portrait = this.portrait(person, px, y + h / 2 - 3, w / occupants.length - 6, h - 22);
        if (portrait) portrait.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openRoom(room.key));
        else this.text(px, y, person.name, 12, C.cream, w / occupants.length - 6).setOrigin(0.5);
      });
      if (!owned && this.ledger.crowns >= room.cost) this.button(x, y + h / 2 - 14, 'Restore · ' + room.cost, () => { this.roomKey = room.key; this.act({ kind: 'restore', key: room.key }); }, true, Math.min(w - 5, 115), false, false, 25, true);
      else if (owned && this.invitations(room.key).length) this.button(x, y + h / 2 - 14, 'Invite', () => this.openRoom(room.key), true, Math.min(w - 5, 95), false, false, 25, true);
    }
  }
  private roomPreview(): void {
    const room = this.currentRoom(); if (!room) return;
    estatePanel(this, 951, 139, 310, 522);
    const art = this.art(estateRoomBackground(room, this.ledger));
    if (art) this.imageIn(art, 963, 151, 286, 161);
    else this.text(976, 205, 'A place to call home', 22, '#d1bd93', 262, true);
    this.text(975, 329, room.name, 26, C.cream, 260, true);
    this.text(975, 405, room.description, 16, '#c9c9b7', 263).setFixedSize(265, 86);
    this.text(975, 500, this.roomStatus(room), 15, '#d8be83', 265);
    this.button(1106, 573, this.ledger.rooms.includes(room.key) ? 'Enter room' : 'View room', () => this.openRoom(room.key), true, 266);
    this.roomNavigation(1106, 627, 266);
  }
  private roomStatus(room: EstateRoom): string {
    const owned = this.ledger.rooms.includes(room.key), members = estateRoomMembers(room);
    if (owned) return members.length ? (members.every(key => this.ledger.residents.includes(key)) ? 'At home' : 'Reserved') + ' · ' + this.guestNames(members) : estateRoomCapacity(room) ? 'Guest suite · Restored' : 'Shared space · Restored';
    return 'Restoration · ' + room.cost + ' crowns';
  }
  private roomNavigation(x: number, y: number, width: number): void {
    const rooms = this.visibleRooms(), index = rooms.findIndex(room => room.key === this.roomKey);
    this.button(x - width / 2 + 38, y, '‹', () => this.stepRoom(-1), index > 0, 64, false, true, 30);
    this.text(x, y - 8, (index + 1) + ' / ' + rooms.length, 13, '#c5b38d').setOrigin(0.5, 0);
    this.button(x + width / 2 - 38, y, '›', () => this.stepRoom(1), index < rooms.length - 1, 64, false, true, 30);
  }
  private roomCards(): void {
    const rooms = this.visibleRooms(), page = Math.min(this.listingPage, Math.max(0, Math.ceil(rooms.length / 6) - 1));
    rooms.slice(page * 6, page * 6 + 6).forEach((room, i) => {
      const x = 28 + i % 3 * 302, y = 148 + Math.floor(i / 3) * 225;
      estatePanel(this, x, y, 280, 210);
      const art = this.art(estateRoomBackground(room, this.ledger)); if (art) this.imageIn(art, x + 8, y + 8, 264, 108);
      this.text(x + 16, y + 124, room.name, 19, C.cream, 249, true);
      this.button(x + 140, y + 180, 'View room', () => this.openRoom(room.key), true, 245, false, true, 32);
    });
    this.button(340, 634, 'Previous', () => { this.listingPage = page - 1; this.render(); }, page > 0, 180, false, true, 32);
    this.button(612, 634, 'Next', () => { this.listingPage = page + 1; this.render(); }, (page + 1) * 6 < rooms.length, 180, false, true, 32);
  }
  private portrait(resident: EstateResident, x: number, bottom: number, width: number, height: number): Phaser.GameObjects.Image | null {
    const ref = getAssetIndex(this).resolve('character', resident.sprite, 'neutral') ?? getAssetIndex(this).resolve('character', resident.sprite, null);
    if (!ref || !this.textures.exists(ref.key)) return null;
    const sprite = this.add.image(x, bottom, ref.key).setOrigin(0.5, 1);
    sprite.setScale(Math.min(width / sprite.width, height / sprite.height)); return sprite;
  }
  private roomInterior(): void {
    const room = this.currentRoom(); if (!room) return;
    const owned = this.ledger.rooms.includes(room.key), intended = this.definition.residents.find(one => one.key === room.residentKey);
    const occupants = estateRoomResidents(this.ledger, room.key);
    const resident = this.definition.residents.find(one => one.key === (this.resident ?? occupants[0]));
    if (!owned && !room.unrestoredBackground) this.add.rectangle(0, 125, 860, 549, 0xd4ceb6, 0.3).setOrigin(0);
    if (owned) occupants.forEach((key, i) => {
      const person = this.definition.residents.find(one => one.key === key); if (!person) return;
      const x = occupants.length > 1 ? 245 + i * 375 : 474;
      if (!this.portrait(person, x, 674, occupants.length > 1 ? 340 : 510, 532)) {
        estatePanel(this, x - 95, 542, 190, 78);
        this.text(x, 566, person.name + ' · At home', 19, C.cream, 180, true).setOrigin(0.5, 0);
      }
    });
    estatePanel(this, 864, 142, 396, 518);
    this.text(889, 165, owned ? 'A PLACE IN THE VILLA' : 'AWAITING RESTORATION', 11, '#ccb27d');
    const title = this.text(889, 191, room.name, 30, C.cream, 342, true);
    if (title.height > 73) title.setFontSize(24);
    this.text(889, 269, room.description, 16, '#ced0bd', 343).setFixedSize(343, 79);
    this.text(889, 353, this.roomStatus(room), 15, '#e6c78e', 343);
    if (!owned) {
      const enough = this.ledger.crowns >= room.cost;
      this.button(1062, 430, enough ? 'Restore · ' + room.cost : 'More crowns needed', () => this.act({ kind: 'restore', key: room.key }), enough, 342);
      this.text(889, 473, intended ? 'A home for ' + this.guestNames(estateRoomMembers(room)) + '. ' + intended.requirement : 'Restore this shared space to enjoy more of the villa.', 17, '#b9c1aa', 341);
    } else if (room.sharedBaths) {
      this.button(1062, 430, 'Take a bath', () => this.takeBath(), true, 342);
      this.text(889, 480, 'Step into the warm pool. Companions who live at the villa can join you here.', 20, '#d7d6c2', 341, true);
    } else if (resident && occupants.includes(resident.key)) {
      this.residentActions(resident, occupants);
      const guest = this.invitations(room.key)[0];
      if (guest) this.button(300, 636, 'Invite ' + this.invitationName(room, guest), () => this.act({ kind: 'invite', key: guest.key, room: room.key }), true, 360);
    }
    else {
      const invitations = this.invitations(room.key), pages = Math.max(1, Math.ceil(invitations.length / 3));
      this.detailPage = Math.min(this.detailPage, pages - 1);
      if (invitations.length) {
        invitations.slice(this.detailPage * 3, this.detailPage * 3 + 3).forEach((guest, i) => this.button(1062, 417 + i * 54, 'Invite ' + this.invitationName(room, guest), () => this.act({ kind: 'invite', key: guest.key, room: room.key }), true, 342));
        this.detailNavigation(pages);
      } else this.text(889, 420, intended ? intended.requirement : estateRoomCapacity(room) ? 'Invitations appear here as relationships are completed.' : 'A restored place for everyone to enjoy. Related visits unlock in each companion’s room.', 20, '#d7d6c2', 341, true);
    }
    this.roomNavigation(1062, 630, 342);
  }
  /** A social view of the household, deliberately separate from bedrooms and invitations. */
  private takeBath(): void {
    const room = this.currentRoom();
    if (this.tutorialStep >= 0 || !room?.sharedBaths || !this.roomEnabled(room) || !this.ledger.rooms.includes(room.key)) return;
    this.detailPage = 0; this.page = 'bath'; this.note = ''; this.render();
  }
  /** Cached, display-only crop; original character files and normal portraits are untouched. */
  private bathPortrait(guest: EstateResident): string | null {
    const ref = guest.bathSprite ? getAssetIndex(this).resolveRef(guest.bathSprite) : null;
    if (ref?.kind !== 'character' || !this.textures.exists(ref.key)) return null;
    const percent = estateBathPercent(guest.bathVisiblePercent), key = `estate-bath:${ref.key}:${percent}`;
    if (this.textures.exists(key)) return key;
    try {
      const source = this.textures.get(ref.key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
      const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return null;
      context.drawImage(source, 0, 0);
      const bounds = estateSpriteBounds(canvas.width, canvas.height, context.getImageData(0, 0, canvas.width, canvas.height).data);
      const height = Math.max(1, Math.round(bounds.height * percent / 100));
      const cropped = this.textures.createCanvas(key, bounds.width, height); if (!cropped) return null;
      const ctx = cropped.getContext();
      ctx.drawImage(canvas, bounds.x, bounds.y, bounds.width, height, 0, 0, bounds.width, height);
      ctx.globalCompositeOperation = 'destination-in';
      const fade = ctx.createLinearGradient(0, height * 0.76, 0, height);
      fade.addColorStop(0, 'rgba(255,255,255,1)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fade; ctx.fillRect(0, 0, bounds.width, height); ctx.globalCompositeOperation = 'source-over';
      cropped.refresh(); return key;
    } catch { return null; }
  }
  private bathInterior(room: EstateRoom): void {
    const guests = estateBathGuests(this.ledger, this.definition, room.key, this.roomVariable)
      .map(guest => ({ guest, texture: this.bathPortrait(guest) })).filter(one => one.texture !== null);
    // Bath variants are authored at their intended display size. Keeping them
    // at scale 1 avoids browser downsampling while still fitting a social pool.
    const guestsPerPage = 4;
    const pages = Math.max(1, Math.ceil(guests.length / guestsPerPage));
    this.detailPage = Math.max(0, Math.min(this.detailPage, pages - 1));
    estatePanel(this, 28, 142, 530, 83);
    this.text(49, 155, room.name, 28, C.cream, 484, true);
    this.text(49, 193, guests.length ? `${guests.length} household guests · A place to unwind` : 'A quiet pool, waiting for the household', 15, '#e6c78e', 484);
    estatePanel(this, 880, 142, 372, 58);
    this.button(1066, 171, 'Leave water', () => this.openRoom(room.key), true, 340, false, true, 36);
    const visible = guests.slice(this.detailPage * guestsPerPage, this.detailPage * guestsPerPage + guestsPerPage);
    visible.forEach(({ guest, texture }, index) => {
      const x = 190 + index * 300;
      const preferredWaterline = visible.length > 2 && index % 2 ? 574 : 514;
      const sprite = this.add.image(x, 0, texture!).setOrigin(0.5, 1);
      // Taller author-selected crops sink a little deeper so their heads never
      // cover the room title, while short crops keep the staggered composition.
      const waterline = Math.min(610, Math.max(preferredWaterline, 236 + sprite.height));
      sprite.setPosition(x, waterline);
      const ripples = this.add.graphics();
      ripples.lineStyle(2, 0xbce0d3, 0.52).strokeEllipse(x, waterline - 9, Math.min(235, sprite.displayWidth + 28), 17);
      ripples.lineStyle(1, 0xd9ebd8, 0.28).strokeEllipse(x, waterline - 6, Math.min(272, sprite.displayWidth + 62), 29);
      this.text(x, waterline + 16, guest.name, 18, C.cream, 236, true).setOrigin(0.5, 0).setShadow(1, 2, '#153c3d', 3);
    });
    if (!guests.length) {
      estatePanel(this, 350, 526, 580, 112);
      this.text(640, 549, 'The water is warm. The house is still quiet.', 23, C.cream, 532, true).setOrigin(0.5, 0);
      this.text(640, 587, 'Company joins you as the household grows.', 16, '#d7d6c2', 532).setOrigin(0.5, 0);
    }
    if (pages > 1) {
      this.button(139, 655, 'Previous guests', () => { this.detailPage--; this.render(); }, this.detailPage > 0, 214, false, true, 32);
      this.text(640, 651, `${this.detailPage + 1} / ${pages}`, 14, C.cream, 65, true).setOrigin(0.5, 0);
      this.button(1141, 655, 'More guests', () => { this.detailPage++; this.render(); }, this.detailPage < pages - 1, 214, false, true, 32);
    }
  }
  private residentActions(resident: EstateResident, occupants: string[]): void {
    if (this.farewell) {
      const home = this.currentRoom();
      const names = home ? this.guestNames(estateInviteGroup(home, resident.key)) : resident.name;
      this.text(889, 415, 'See ' + names + ' off? The room and your memories will be kept.', 20, C.cream, 337, true);
      this.button(972, 535, 'Cancel', () => { this.farewell = false; this.render(); }, true, 166);
      this.button(1152, 535, 'See her off', () => this.act({ kind: 'farewell', key: resident.key }), true, 166); return;
    }
    const scenes = resident.scenes.filter(scene => this.visibleRooms().some(room => room.key === scene.room));
    const pages = Math.max(1, Math.ceil(scenes.length / 2)); this.detailPage = Math.min(this.detailPage, pages - 1);
    if (!scenes.length) this.text(889, 412, 'At home, with you.', 22, C.cream, 340, true);
    scenes.slice(this.detailPage * 2, this.detailPage * 2 + 2).forEach((scene, i) => {
      const gateOpen = estateSceneEnabled(scene, this.eligible);
      const unlocked = gateOpen && this.ledger.rooms.includes(scene.room) && this.eligible(resident.eligibilityVariable);
      this.button(1062, 416 + i * 74, scene.title, () => this.act({ kind: 'scene', result: scene.result }), unlocked, 342);
      const where = this.definition.rooms.find(one => one.key === scene.room);
      const hint = !this.eligible(resident.eligibilityVariable) ? resident.requirement : !this.ledger.rooms.includes(scene.room) ? 'Restore ' + (where?.name ?? scene.room) : !gateOpen ? 'Continue her story to unlock this moment' : this.ledger.seen.includes(scene.result) ? 'Revisit this moment' : 'A new moment together';
      this.text(895, 441 + i * 74, hint, 12, '#bcbda5', 331);
    });
    this.detailNavigation(pages);
    this.button(1062, 589, this.currentRoom()?.inviteTogether ? 'See them off' : 'See her off', () => { this.farewell = true; this.render(); }, true, 342, false, true, 29);
    if (occupants.length > 1) this.button(735, 636, 'Next guest', () => { this.resident = occupants[(occupants.indexOf(resident.key) + 1) % occupants.length] ?? null; this.detailPage = 0; this.render(); }, true, 180, false, true, 34);
  }
  private detailNavigation(pages: number): void {
    if (pages <= 1) return;
    this.button(970, 554, 'Previous', () => { this.detailPage--; this.render(); }, this.detailPage > 0, 164, false, true, 27);
    this.button(1153, 554, 'Next', () => { this.detailPage++; this.render(); }, this.detailPage < pages - 1, 164, false, true, 27);
  }
  private roomGates(): void {
    if (this.launchData.mode !== 'test') return;
    estatePanel(this, 225, 145, 830, 510);
    this.text(259, 170, 'Room availability · test mode', 29, C.cream, 740, true);
    this.text(259, 212, 'Toggle the Ink booleans used by room gates. Reset test restores their story values.', 16, '#c9c9b7', 730);
    const variables = [...new Set(this.definition.rooms.map(room => room.availabilityVariable).filter((name): name is string => !!name))];
    const pages = Math.max(1, Math.ceil(variables.length / 6)); this.gatePage = Math.min(this.gatePage, pages - 1);
    variables.slice(this.gatePage * 6, this.gatePage * 6 + 6).forEach((variable, i) => {
      const on = this.roomVariable(variable), y = 285 + i * 47;
      this.text(262, y - 10, variable, 18, C.cream, 550);
      this.button(945, y, on ? 'True' : 'False', () => { this.testGates.set(variable, !on); this.render(); }, true, 135, on, false, 34);
    });
    this.button(329, 612, 'Previous', () => { this.gatePage--; this.render(); }, this.gatePage > 0, 145, false, true, 32);
    this.button(640, 612, 'The villa', () => this.navigate('villa'), true, 190);
    this.button(945, 612, 'Next', () => { this.gatePage++; this.render(); }, this.gatePage < pages - 1, 145, false, true, 32);
  }
  private commissions(): void {
    const notices = this.definition.contracts;
    const board = commissionBoard(this.ledger.day, notices), quote = commissionQuote(this.ledger.day, this.ledger.selected, this.bonus, notices);
    this.text(48, 145, this.workFinished() ? 'Commissions complete' : 'The day’s commissions', 28, '#ffedc8', 660, true);
    this.text(49, 180, this.workFinished() ? 'No further work or payouts. Enjoy the household you have built.' : 'Pin the notices your crews can fulfill.', 16, '#e1cca9');
    board.contracts.forEach((contract, index) => {
      const x = 43 + index % 3 * 294, y = 218 + Math.floor(index / 3) * 215;
      const locked = this.boardLocked();
      const chosen = this.ledger.selected.includes(index), possible = !locked && (chosen || commissionQuote(this.ledger.day, [...this.ledger.selected, index], 0, notices).valid);
      estatePanel(this, x, y, 274, 192, true);
      const g = this.add.graphics();
      g.fillStyle(0x312218, 0.3).fillCircle(x + 139, y + 11, 5).fillStyle(0xb09262).fillCircle(x + 137, y + 9, 4);
      g.fillStyle(0xccb58c).fillTriangle(x + 253, y + 7, x + 267, y + 21, x + 253, y + 21);
      g.lineStyle(1, 0xa28b61, 0.6).lineBetween(x + 19, y + 88, x + 255, y + 88);
      this.text(x + 18, y + 29, contract.name, 22, '#352f22', 239, true);
      this.text(x + 18, y + 64, 'REWARD  ·  ' + contract.pay + ' CROWNS', 12, '#776035');
      this.text(x + 18, y + 100, contract.needs.map((n, i) => n ? n + ' ' + CREWS[i]!.toLowerCase() : '').filter(Boolean).join(' · '), 14, '#4e513a', 236);
      if (chosen) {
        g.fillStyle(0x7b3829).fillCircle(x + 241, y + 79, 16).lineStyle(1, 0xb6704b).strokeCircle(x + 241, y + 79, 12);
        this.text(x + 233, y + 68, '✓', 21, '#f3d5a2');
      }
      this.button(x + 137, y + 160, this.workFinished() ? 'Closed' : locked ? 'Paid today' : chosen ? 'Unpin' : possible ? 'Assign crew' : 'Crews occupied', () => this.act({ kind: 'contract', index }), possible, 236, chosen, false, 35);
    });
    estatePanel(this, 945, 145, 310, 511);
    this.text(969, 169, 'Steward’s ledger', 26, C.cream, 266, true);
    this.text(970, 209, 'AVAILABLE CREWS', 11, '#c6b389');
    CREWS.forEach((name, i) => {
      const y = 239 + i * 60;
      this.text(970, y, name, 17, '#d8dcc9');
      this.text(1219, y, (board.crews[i]! - quote.used[i]!) + ' free', 14, '#d7c293').setOrigin(1, 0);
      for (let n = 0; n < board.crews[i]!; n++) this.add.graphics().fillStyle(n < quote.used[i]! ? 0x827452 : 0xcdb17a).fillRoundedRect(971 + n * 34, y + 28, 25, 8, 2);
    });
    this.add.graphics().lineStyle(1, C.gold, 0.5).lineBetween(969, 420, 1230, 420);
    if (this.workFinished()) {
      this.text(970, 442, 'The work is done', 23, C.cream, 260, true);
      this.text(970, 482, 'Your remaining crowns can still restore rooms. Invitations and visits remain open.', 18, '#c5cbb6', 260);
      this.button(1100, 601, 'The villa', () => this.navigate('villa'), true, 262, false, false, 46);
      return;
    }
    this.text(970, 438, 'Daily stipend', 16, '#c5cbb6'); this.text(1226, 438, String(this.stipend), 17, C.cream).setOrigin(1, 0);
    this.text(970, 468, 'Commissions', 16, '#c5cbb6'); this.text(1226, 468, String(quote.pay), 17, C.cream).setOrigin(1, 0);
    this.text(970, 509, (this.stipend + quote.pay) + ' crowns', 28, '#f3d798', 268, true);
    this.text(970, 546, this.bonus && this.ledger.selected.length ? 'Includes ' + this.bonus + ' crowns from your stats.' : 'Upkeep is covered. No crew costs.', 12, '#b8bea7', 265);
    if (this.calendar) this.button(1100, 601, this.boardLocked() ? 'Paid today' : 'Pays at dusk', () => {}, false, 262, false, false, 46);
    else if (this.launchData.mode === 'test') this.button(1100, 601, 'End day', () => this.act({ kind: 'settle' }), quote.valid, 262, false, false, 46);
  }
  private text(x: number, y: number, text: string, size = 18, color = '#cdd4d8', width?: number, serif = false): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, { fontFamily: serif ? 'Georgia, serif' : 'system-ui, sans-serif', fontSize: size + 'px', color, lineSpacing: 3, ...(width ? { wordWrap: { width } } : {}) });
  }
  /** Never reveal a story-disabled room just because the tour mentions it. */
  private tutorialSteps(): EstateTutorialStep[] {
    return this.definition.tutorial?.steps.filter(step => !step.room || this.visibleRooms().some(room => room.key === step.room)) ?? [];
  }
  private startTutorial(): void {
    if (this.closed || this.tutorialStep >= 0 || !this.tutorialSteps().length) { this.render(); return; }
    this.tutorialReturn = { page: this.page, room: this.roomKey, resident: this.resident, detail: this.detailPage, note: this.note };
    this.farewell = false; this.tutorialStep = 0; this.moveTutorial(0);
  }
  private moveTutorial(offset: number): void {
    const steps = this.tutorialSteps();
    this.tutorialStep = Math.max(0, this.tutorialStep + offset);
    const step = steps[this.tutorialStep];
    if (!step) { this.endTutorial(); return; }
    this.page = step.page;
    if (step.room) this.roomKey = step.room;
    this.resident = estateRoomResidents(this.ledger, this.roomKey)[0] ?? null;
    this.detailPage = 0; this.render();
  }
  private endTutorial(): void {
    if (this.tutorialStep < 0) return;
    this.ledger = { ...this.ledger, tutorialSeen: this.definition.tutorial?.version ?? 1 };
    this.tutorialStep = -1;
    const previous = this.tutorialReturn;
    if (previous) {
      this.page = previous.page; this.roomKey = previous.room; this.resident = previous.resident;
      this.detailPage = previous.detail; this.note = previous.note;
    }
    this.tutorialReturn = null; this.persist(); this.render();
  }
  private tutorialBounds(step: EstateTutorialStep): { x: number; y: number; width: number; height: number } {
    switch (step.target) {
      case 'funds': return { x: 618, y: 14, width: 253, height: 65 };
      case 'noticeboard': return { x: 210, y: 76, width: 193, height: 44 };
      case 'notices': return { x: 39, y: 214, width: 282, height: 200 };
      case 'crews': return { x: 958, y: 226, width: 279, height: 182 };
      case 'income': return { x: 958, y: 427, width: 279, height: 209 };
      case 'restore': return { x: 879, y: 349, width: 366, height: 151 };
      case 'invitation': case 'visits': return { x: 879, y: 349, width: 366, height: 265 };
      case 'return': return { x: 1102, y: 20, width: 155, height: 50 };
      case 'room': {
        const room = this.visibleRooms().find(room => room.key === step.room), box = room?.bounds;
        if (box && this.art(this.definition.background)) {
          const size = this.definition.floorPlanSize, scale = Math.min(916 / size.width, 516 / size.height);
          return { x: 20 + (916 - size.width * scale) / 2 + (box.x - box.width / 2) * scale,
            y: 142 + (516 - size.height * scale) / 2 + (box.y - box.height / 2) * scale,
            width: box.width * scale, height: box.height * scale };
        }
        // Card-layout villas still have a selected-room preview with View room.
        return { x: 961, y: 318, width: 288, height: 283 };
      }
      default: return { x: 17, y: 139, width: 922, height: 522 };
    }
  }
  private drawTutorial(): void {
    const tutorial = this.definition.tutorial, steps = this.tutorialSteps(), step = steps[this.tutorialStep];
    if (!tutorial || !step) return;
    // Both input paths are modal: deactivate registered targets as well as mouse hit areas.
    // Phaser's active flag affects updates, not rendering, so the real UI remains visible.
    for (const child of this.children.list) { child.setActive(false); child.disableInteractive(); }
    this.controls = []; this.focused = -1;
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0).setOrigin(0).setInteractive();
    const b = this.tutorialBounds(step), shade = this.add.graphics().fillStyle(0x07110d, 0.72);
    shade.fillRect(0, 0, 1280, b.y).fillRect(0, b.y + b.height, 1280, 720 - b.y - b.height)
      .fillRect(0, b.y, b.x, b.height).fillRect(b.x + b.width, b.y, 1280 - b.x - b.width, b.height);
    this.add.graphics().lineStyle(3, 0xf5d493).strokeRoundedRect(b.x, b.y, b.width, b.height, 5);
    // Keep the guide opposite the highlighted controls, with her portrait beside the copy.
    const left = b.x + b.width / 2 < 600 ? 438 : 18;
    estatePanel(this, left, 459, 824, 246);
    const guide = getAssetIndex(this).resolve('character', tutorial.speaker.sprite, tutorial.speaker.expression ?? 'neutral');
    if (guide && this.textures.exists(guide.key)) {
      const sprite = this.add.image(left + 107, 704, guide.key).setOrigin(0.5, 1).setName('estate-tutorial-guide');
      sprite.setScale(Math.min(216 / sprite.width, 364 / sprite.height));
    }
    this.text(left + 228, 477, tutorial.speaker.name + '  /  ' + (this.tutorialStep + 1) + ' OF ' + steps.length, 12, '#e1c28a', 566);
    this.text(left + 228, 499, step.title, 24, C.cream, 566, true);
    const copy = this.text(left + 228, 537, !this.calendar && step.testText ? step.testText : step.text, 19, '#e4dec9', 566, true);
    // Long edited steps stay above the navigation, including explicit line breaks.
    if (copy.height > 98) copy.setScale(Math.min(1, 98 / copy.height));
    this.button(left + 722, 669, this.tutorialStep === steps.length - 1 ? 'Finish' : 'Next', () => this.moveTutorial(1), true, 138);
    this.button(left + 563, 669, 'Back', () => this.moveTutorial(-1), this.tutorialStep > 0, 138, false, true);
    this.button(left + 297, 669, 'Skip tour', () => this.endTutorial(), true, 138, false, true);
    this.focused = 0; this.controls[0]?.focus(true);
  }
  private button(x: number, y: number, label: string, action: () => void, enabled = true, width = 240, selected = false, subtle = false, height = 42, compact = false): void {
    const control = estateButton(this, x, y, label, action, { enabled, width, selected, subtle, height, compact });
    if (enabled) this.controls.push(control);
  }
}

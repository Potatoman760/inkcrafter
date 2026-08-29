import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from "@/config/gameConfig";
import { getAssetIndex, getBundle } from "@/bundle/registry";
import type { GalleryGroup, GalleryMediaRef } from "@/bundle/spec/bundle/galleryDoc";
import { isVideoFile } from "@/bundle/spec/mediaDoc";
import { GalleryUnlocks } from "@/gallery/GalleryUnlocks";
import { makeButton } from "@/ui/Button";
import { UI_TEXT } from "@/config/uiText";
import { registerFocusable, setControllerActions } from "@/input/FocusNavigation";
import { PlayerSettings } from "@/settings/PlayerSettings";

type GalleryView = { kind: "groups" } | { kind: "group"; group: GalleryGroup } | { kind: "full"; group: GalleryGroup; ref: GalleryMediaRef };

/** Title-screen gallery: group selectors, locked thumbnails, and full scene art. */
export class GalleryScene extends Phaser.Scene {
  private view: GalleryView = { kind: "groups" };

  constructor() {
    super(SceneKey.Gallery);
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#080a12");
    setControllerActions(this, { back: () => this.back() });
    this.input.keyboard?.on("keydown-ESC", () => this.back());
    this.draw();
  }

  private draw(): void {
    this.children.removeAll(true);
    this.add.text(48, 30, this.view.kind === "groups" ? UI_TEXT.galleryTitle : this.view.group.name, {
      fontFamily: "Georgia, serif",
      fontSize: "42px",
      color: "#ffd98a",
    });
    makeButton(this, GAME_WIDTH - 100, 52, UI_TEXT.galleryBack, () => this.back(), {
      width: 150,
      height: 46,
      fontSize: "18px",
    });

    if (this.view.kind === "groups") this.drawGroups();
    else if (this.view.kind === "group") this.drawGroup(this.view.group);
    else this.drawFull(this.view.group, this.view.ref);
  }

  private drawGroups(): void {
    const groups = getBundle(this).gallery.groups;
    let x = 70;
    let y = 115;
    let rowHeight = 0;

    for (const group of groups) {
      const portrait = group.aspect === "9:16";
      const width = portrait ? 150 : 280;
      const height = portrait ? 267 : 158;
      if (x + width > GAME_WIDTH - 60) {
        x = 70;
        y += rowHeight + 72;
        rowHeight = 0;
      }
      const cx = x + width / 2;
      const cy = y + height / 2;
      this.add.rectangle(cx, cy, width, height, 0x151a2b, 1).setStrokeStyle(2, 0x5a6b8c);
      if (group.cover) this.drawMedia(group.cover, cx, cy, width - 8, height - 8);
      this.add.text(cx, y + height + 12, group.name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#f2f2f2",
        align: "center",
        wordWrap: { width },
      }).setOrigin(0.5, 0);
      const zone = this.add.zone(cx, cy, width, height + 50).setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.view = { kind: "group", group };
          this.draw();
        });
      const marker = this.add.rectangle(cx, cy, width + 8, height + 8, 0x000000, 0)
        .setStrokeStyle(3, 0xffd98a).setVisible(false);
      registerFocusable(this, {
        object: zone,
        activate: () => { this.view = { kind: "group", group }; this.draw(); },
        onFocus: (focused) => marker.setVisible(focused),
      });
      x += width + 34;
      rowHeight = Math.max(rowHeight, height);
    }
  }

  private drawGroup(group: GalleryGroup): void {
    if (group.items.length === 0) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, UI_TEXT.galleryEmpty, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "24px",
        color: "#8e9ab5",
      }).setOrigin(0.5);
      return;
    }

    const width = 350;
    const height = 197;
    const gap = 28;
    const columns = 3;
    const left = (GAME_WIDTH - (columns * width + (columns - 1) * gap)) / 2;
    group.items.forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = left + column * (width + gap) + width / 2;
      const y = 118 + row * (height + 58) + height / 2;
      const open = GalleryUnlocks.isUnlocked(item);
      this.add.rectangle(x, y, width, height, open ? 0x151a2b : 0x0d101a, 1)
        .setStrokeStyle(2, open ? 0x5a6b8c : 0x34394a);
      if (open) {
        this.drawMedia(item, x, y, width - 8, height - 8);
        const zone = this.add.zone(x, y, width, height).setInteractive({ useHandCursor: true })
          .on("pointerdown", () => {
            this.view = { kind: "full", group, ref: item };
            this.draw();
          });
        const marker = this.add.rectangle(x, y, width + 8, height + 8, 0x000000, 0)
          .setStrokeStyle(3, 0xffd98a).setVisible(false);
        registerFocusable(this, {
          object: zone,
          activate: () => { this.view = { kind: "full", group, ref: item }; this.draw(); },
          onFocus: (focused) => marker.setVisible(focused),
        });
      } else {
        this.add.text(x, y, UI_TEXT.galleryLocked, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "21px",
          color: "#666d80",
        }).setOrigin(0.5);
      }
    });
  }

  private drawFull(_group: GalleryGroup, ref: GalleryMediaRef): void {
    this.drawMedia(ref, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 25, GAME_WIDTH - 80, GAME_HEIGHT - 125);
  }

  private drawMedia(ref: GalleryMediaRef, x: number, y: number, width: number, height: number): void {
    const found = getAssetIndex(this).resolveRef(ref);
    if (!found) return;
    if (isVideoFile(found.path)) {
      const view = this.view;
      void getAssetIndex(this).prepareVideo(this, found).then((ready) => {
        // Navigating while a large protected clip decrypts destroys this view;
        // do not let its eventual completion draw into the next one.
        if (this.view !== view || !this.scene.isActive()) return;
        const clip = this.add.video(x, y, ready.key).setMute(true).setLoop(true);
        const fit = () => fitInside(clip, width, height);
        clip.once(Phaser.GameObjects.Events.VIDEO_PLAY, () => {
          fit();
          if (PlayerSettings.values.reducedMotion) clip.setPaused(true);
        });
        clip.play(true);
        fit();
      }).catch((error: unknown) => console.error("Could not open gallery video.", error));
    } else {
      fitInside(this.add.image(x, y, found.key), width, height);
    }
  }

  private back(): void {
    if (this.view.kind === "full") this.view = { kind: "group", group: this.view.group };
    else if (this.view.kind === "group") this.view = { kind: "groups" };
    else {
      this.scene.start(SceneKey.MainMenu);
      return;
    }
    this.draw();
  }
}

function fitInside(object: Phaser.GameObjects.Image | Phaser.GameObjects.Video, width: number, height: number): void {
  if (object.width <= 0 || object.height <= 0) return;
  object.setScale(Math.min(width / object.width, height / object.height));
}

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ChatProgress } from '@shared/chat'
import type { MenuAction } from '@shared/settings'
import type { CompileRequest, InkCrafterApi } from '@shared/types'

const api: InkCrafterApi = {
  compile: (request: CompileRequest) => ipcRenderer.invoke('ink:compile', request),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  saveFile: (filePath, contents) => ipcRenderer.invoke('file:save', filePath, contents),

  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (title) => ipcRenderer.invoke('projects:create', title),
    save: (project) => ipcRenderer.invoke('projects:save', project),
    files: (project) => ipcRenderer.invoke('projects:files', project),
    addFile: (project, path) => ipcRenderer.invoke('projects:addFile', project, path),
    folders: (project) => ipcRenderer.invoke('projects:folders', project),
    addFolder: (project, path) => ipcRenderer.invoke('projects:addFolder', project, path),
    moveFile: (project, from, to) => ipcRenderer.invoke('projects:moveFile', project, from, to),
    copyFile: (project, from, toFolder) =>
      ipcRenderer.invoke('projects:copyFile', project, from, toFolder),
    references: (project, path) => ipcRenderer.invoke('projects:references', project, path),
    deleteFile: (project, path) => ipcRenderer.invoke('projects:deleteFile', project, path),
    reveal: (project) => ipcRenderer.invoke('projects:reveal', project)
  },

  libraries: {
    list: () => ipcRenderer.invoke('libraries:list'),
    create: (title) => ipcRenderer.invoke('libraries:create', title),
    save: (library) => ipcRenderer.invoke('libraries:save', library),
    reveal: (id) => ipcRenderer.invoke('libraries:reveal', id)
  },

  codex: {
    load: (libraryIds) => ipcRenderer.invoke('codex:load', libraryIds),
    save: (entry, names) => ipcRenderer.invoke('codex:save', entry, names),
    remove: (entry) => ipcRenderer.invoke('codex:remove', entry),
    move: (entry, toFile) => ipcRenderer.invoke('codex:move', entry, toFile)
  },

  manuscript: {
    open: (project, entryPath) => ipcRenderer.invoke('manuscript:open', project, entryPath),
    choose: (nodeId, choiceIndex) => ipcRenderer.invoke('manuscript:choose', nodeId, choiceIndex),
    reread: () => ipcRenderer.invoke('manuscript:reread'),
    edit: (nodeId, choiceIndex, text) =>
      ipcRenderer.invoke('manuscript:edit', nodeId, choiceIndex, text),
    traceTo: (project, entryPath, knot) =>
      ipcRenderer.invoke('manuscript:traceTo', project, entryPath, knot),
    sectionReplaceable: (sectionIndex) =>
      ipcRenderer.invoke('manuscript:sectionReplaceable', sectionIndex),
    setSectionTag: (sectionIndex, command, replacing) =>
      ipcRenderer.invoke('manuscript:setSectionTag', sectionIndex, command, replacing),
    clearSectionTag: (sectionIndex, raw) =>
      ipcRenderer.invoke('manuscript:clearSectionTag', sectionIndex, raw),
    compose: (sectionIndex, mode, text) =>
      ipcRenderer.invoke('manuscript:compose', sectionIndex, mode, text),
    close: () => ipcRenderer.invoke('manuscript:close')
  },

  plan: {
    read: (project) => ipcRenderer.invoke('plan:read', project),
    write: (project, plan) => ipcRenderer.invoke('plan:write', project, plan),
    createScene: (project, plan, chapterId, title) =>
      ipcRenderer.invoke('plan:createScene', project, plan, chapterId, title)
  },

  stats: {
    read: (project) => ipcRenderer.invoke('stats:read', project),
    write: (project, doc) => ipcRenderer.invoke('stats:write', project, doc),
    uses: (project, name) => ipcRenderer.invoke('stats:uses', project, name)
  },

  media: {
    read: (project) => ipcRenderer.invoke('media:read', project),
    write: (project, doc) => ipcRenderer.invoke('media:write', project, doc),
    scan: (project) => ipcRenderer.invoke('media:scan', project),
    deleteFile: (project, file) => ipcRenderer.invoke('media:deleteFile', project, file),
    reveal: (project) => ipcRenderer.invoke('media:reveal', project),
    importLook: (project, request) => ipcRenderer.invoke('media:importLook', project, request),
    cutout: (project, request) => ipcRenderer.invoke('media:cutout', project, request)
  },

  npcs: {
    read: (project) => ipcRenderer.invoke('npcs:read', project),
    write: (project, doc) => ipcRenderer.invoke('npcs:write', project, doc)
  },

  map: {
    read: (project) => ipcRenderer.invoke('map:read', project),
    write: (project, doc) => ipcRenderer.invoke('map:write', project, doc),
    destinations: (project) => ipcRenderer.invoke('map:destinations', project)
  },

  gallery: {
    read: (project) => ipcRenderer.invoke('gallery:read', project),
    write: (project, doc) => ipcRenderer.invoke('gallery:write', project, doc)
  },

  achievements: {
    read: (project) => ipcRenderer.invoke('achievements:read', project),
    write: (project, doc) => ipcRenderer.invoke('achievements:write', project, doc)
  },

  minigames: {
    read: (project) => ipcRenderer.invoke('minigames:read', project),
    write: (project, doc) => ipcRenderer.invoke('minigames:write', project, doc)
  },

  bundle: {
    export: (project, outDir) => ipcRenderer.invoke('bundle:export', project, outDir),
    generateProtection: () => ipcRenderer.invoke('bundle:generateProtection'),
    installProtection: (profile) => ipcRenderer.invoke('bundle:installProtection', profile),
    chooseDir: (current) => ipcRenderer.invoke('bundle:chooseDir', current),
    reveal: (outDir) => ipcRenderer.invoke('bundle:reveal', outDir)
  },

  ai: {
    writeSection: (request) => ipcRenderer.invoke('ai:writeSection', request),
    writeInk: (request, project) => ipcRenderer.invoke('ai:writeInk', request, project),
    chat: (request) => ipcRenderer.invoke('ai:chat', request),
    onChatProgress: (handler) => {
      const listener = (_event: IpcRendererEvent, progress: ChatProgress): void => handler(progress)
      ipcRenderer.on('ai:chatProgress', listener)
      return () => ipcRenderer.removeListener('ai:chatProgress', listener)
    }
  },

  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    setInterfaceScale: (scale) => ipcRenderer.invoke('settings:setInterfaceScale', scale),
    saveProviders: (providers, activeProviderId) =>
      ipcRenderer.invoke('settings:saveProviders', providers, activeProviderId),
    createProvider: (label) => ipcRenderer.invoke('settings:createProvider', label),
    deleteProvider: (providerId) => ipcRenderer.invoke('settings:deleteProvider', providerId),
    setApiKey: (providerId, key) => ipcRenderer.invoke('settings:setApiKey', providerId, key),
    testProvider: (providerId) => ipcRenderer.invoke('settings:testProvider', providerId),
    listModels: (providerId) => ipcRenderer.invoke('settings:listModels', providerId),
    setPlayerDir: (dir) => ipcRenderer.invoke('settings:setPlayerDir', dir),
    setComfyBaseUrl: (url) => ipcRenderer.invoke('settings:setComfyBaseUrl', url),
    setComfyWorkflowDir: (dir) => ipcRenderer.invoke('settings:setComfyWorkflowDir', dir),
    setComfyTimeout: (seconds) => ipcRenderer.invoke('settings:setComfyTimeout', seconds),
    setComfyPromptPrefix: (workflow, prefix) =>
      ipcRenderer.invoke('settings:setComfyPromptPrefix', workflow, prefix),
    setComfyBinding: (workflow, slot, at) =>
      ipcRenderer.invoke('settings:setComfyBinding', workflow, slot, at),
    clearComfyBinding: (workflow, slot) =>
      ipcRenderer.invoke('settings:clearComfyBinding', workflow, slot),
    setComfyDefault: (role, workflow) =>
      ipcRenderer.invoke('settings:setComfyDefault', role, workflow),
    setComfyRole: (workflow, role) => ipcRenderer.invoke('settings:setComfyRole', workflow, role),
    setPrompt: (kind, text) => ipcRenderer.invoke('settings:setPrompt', kind, text),
    promptDefaults: () => ipcRenderer.invoke('settings:promptDefaults')
  },
  comfy: {
    test: () => ipcRenderer.invoke('comfy:test'),
    chooseDir: () => ipcRenderer.invoke('comfy:chooseDir'),
    workflows: () => ipcRenderer.invoke('comfy:workflows')
  },

  player: {
    choose: () => ipcRenderer.invoke('player:choose'),
    check: (dir) => ipcRenderer.invoke('player:check', dir),
    status: () => ipcRenderer.invoke('player:status'),
    // Project stays the first argument for compatibility with a main process
    // that has not restarted after a renderer hot reload.
    preview: (project, target) => ipcRenderer.invoke('player:preview', project, target),
    stop: () => ipcRenderer.invoke('player:stop'),
    open: (previewId, minigame) => ipcRenderer.invoke('player:open', previewId, minigame)
  },

  workspace: {
    dataDir: () => ipcRenderer.invoke('workspace:dataDir'),
    reveal: () => ipcRenderer.invoke('workspace:reveal')
  },

  onMenuAction: (handler) => {
    // The IpcRendererEvent carries a reference to the sender, so it is unwrapped
    // here rather than handed across the context bridge.
    const listener = (_event: IpcRendererEvent, action: MenuAction): void => handler(action)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  },

  platform: process.platform
}

contextBridge.exposeInMainWorld('inkcrafter', api)

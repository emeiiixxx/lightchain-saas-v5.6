import { notify } from './Toast';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Icon, type IconName } from './ui';
import { usePresence } from '../usePresence';
import './prompt-tools.css';
import type { PromptEntry as Entry } from '../prompt-types';
import type { PromptStoreResult } from '../prompt-storage';
import { usePromptLibrary } from '../PromptLibraryContext';
import { PromptCoverField } from './PromptCoverField';
export function PromptTools({value,onChange,labels,expandIcon='fusionExpand',expandDisabled=false,hideInlineActions=false,iconSize=16,maxLength=2000,inlineIcons,expandedAction,expandedHeaderAction}:{expandIcon?:IconName;expandDisabled?:boolean;hideInlineActions?:boolean;iconSize?:number;maxLength?:number;inlineIcons?:{expand:ReactNode;save:ReactNode;library:ReactNode};expandedAction?:ReactNode;expandedHeaderAction?:ReactNode;value:string;onChange:(v:string)=>void;labels:{expand:string;save:string;library:string;prompt:string;clear:string;close:string}}){
 const [editorOpen,setEditorOpen]=useState(false), editorShown=usePresence(editorOpen?true:null);
 const [libraryOpen,setLibraryOpen]=useState(false), libraryShown=usePresence(libraryOpen?true:null);
 const [anchor,setAnchor]=useState<HTMLElement|null>(null), saveShown=usePresence(anchor);
 const {entries,store}=usePromptLibrary();
 const save=(el:HTMLElement)=>{if(!value.trim()){notify('请输入提示词后再保存');return;}setAnchor(el);};
 const openLibrary=()=>setLibraryOpen(true);
 const actions=(large=false)=><><Button className={large?'':'fusion-xs-icon'} aria-label={labels.save} title={labels.save} onClick={e=>save(e.currentTarget)}>{!large&&inlineIcons?inlineIcons.save:<Icon name="fusionSave" size={large?20:16}/>}</Button><Button className={large?'':'fusion-xs-icon'} aria-label={labels.library} title={labels.library} onClick={openLibrary}>{!large&&inlineIcons?inlineIcons.library:<Icon name="fusionPrompts" size={large?20:16}/>}</Button></>;
 return <><Button className="fusion-xs-icon" aria-label={labels.expand} title={labels.expand} disabled={expandDisabled} onClick={()=>setEditorOpen(true)}>{inlineIcons?inlineIcons.expand:<Icon name={expandIcon} size={iconSize}/>}</Button>{!hideInlineActions&&actions()}
 {editorShown.value&&createPortal(<ExpandedPrompt phase={editorShown.phase} title={labels.prompt} value={value} maxLength={maxLength} onChange={onChange} onClose={()=>setEditorOpen(false)} actions={actions(true)} expandedAction={expandedAction} expandedHeaderAction={expandedHeaderAction} clear={labels.clear}/>,document.body)}
 {libraryShown.value&&createPortal(<PromptLibrary phase={libraryShown.phase} entries={entries} maxLength={maxLength} onStore={store} onClose={()=>setLibraryOpen(false)} onApply={(text,mode)=>{const next=mode==='append'&&value.trim()?value+(value.endsWith('\n')?'':'\n')+text:text;if(next.length>maxLength){notify(mode==='append'?`插入合并后超过${maxLength}字，请先精简原文或选择覆盖`:`提示词超过${maxLength}字，请先精简内容`, 'error');return;}onChange(next);setLibraryOpen(false);}}/>,document.body)}
 {saveShown.value&&createPortal(<SavePrompt anchor={saveShown.value} phase={saveShown.phase} onClose={()=>setAnchor(null)} onSave={async name=>{const result=await store([{id:crypto.randomUUID(),name,content:value},...entries]);if(result.ok)setAnchor(null);return result;}}/>, saveShown.value.closest('dialog')??document.body)}
 </>;
}
function SavePrompt({anchor,phase,onClose,onSave}:{anchor:HTMLElement;phase:'enter'|'exit';onClose:()=>void;onSave:(name:string)=>Promise<PromptStoreResult>}){
 const ref=useRef<HTMLDivElement>(null);const [name,setName]=useState('');const [busy,setBusy]=useState(false);const busyRef=useRef(false);
 const submit=async()=>{if(!name.trim()||busyRef.current)return;busyRef.current=true;setBusy(true);try{const result=await onSave(name.trim());if(!result.ok)notify(result.message,'error');}finally{busyRef.current=false;setBusy(false);}};
 useLayoutEffect(()=>{const el=ref.current!;el.showPopover();let frame=0;const place=()=>{const r=anchor.getBoundingClientRect();el.style.left=`${Math.max(8,Math.min(r.left,innerWidth-el.offsetWidth-8))}px`;el.style.top=`${Math.max(8,r.top-el.offsetHeight-8>=8?r.top-el.offsetHeight-8:Math.min(r.bottom+8,innerHeight-el.offsetHeight-8))}px`;frame=requestAnimationFrame(place);};place();el.querySelector('input')?.focus({preventScroll:true});return()=>cancelAnimationFrame(frame);},[anchor]);
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(!busyRef.current&&e.target instanceof Node&&!ref.current?.contains(e.target)&&!anchor.contains(e.target))onClose();};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);},[anchor,onClose]);
 return <div ref={ref} popover="manual" data-overlay data-select-popup role="dialog" aria-label="保存提示词" className="prompt-save-popover" data-phase={phase} inert={phase==='exit'} aria-busy={busy} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();if(!busyRef.current){onClose();anchor.focus({preventScroll:true});}}if(e.key==='Enter'&&!e.nativeEvent.isComposing&&name.trim()){e.preventDefault();void submit();}}}>
 <header><h3>保存提示词</h3><Button aria-label="关闭" disabled={busy} onClick={onClose}><Icon name="close" size={16}/></Button></header>
 <label className="prompt-name-input"><input aria-label="提示词名称" placeholder="请输入名称" value={name} maxLength={50} disabled={busy} onChange={e=>setName(e.target.value)}/><span>{name.length}/50</span></label>
 <footer><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button variant="primary" disabled={!name.trim()||busy} onClick={()=>void submit()}>保存</Button></footer></div>;
}
function useModal(ref:React.RefObject<HTMLDialogElement|null>){useEffect(()=>{const old=document.activeElement as HTMLElement|null;const el=ref.current!;el.showModal();return()=>{el.close();if(old?.isConnected)old.focus({preventScroll:true});};},[]);}
function ExpandedPrompt({phase,title,value,maxLength,onChange,onClose,actions,expandedAction,expandedHeaderAction,clear}:{phase:'enter'|'exit';title:string;value:string;maxLength:number;onChange:(v:string)=>void;onClose:()=>void;actions:ReactNode;expandedAction?:ReactNode;expandedHeaderAction?:ReactNode;clear:string}){
 const ref=useRef<HTMLDialogElement>(null);useModal(ref);
 const [box,setBox]=useState(()=>({x:Math.max(16,(innerWidth-960)/2),y:Math.max(96,(innerHeight-680)/2),w:Math.min(960,innerWidth-32),h:Math.min(640,innerHeight-152)}));
 const drag=useRef<{x:number;y:number;box:typeof box;corner:string}|null>(null);
 useEffect(()=>{const resize=()=>setBox(b=>({...b,w:Math.min(b.w,innerWidth-32),h:Math.min(b.h,innerHeight-152),x:Math.max(16,Math.min(b.x,innerWidth-Math.min(b.w,innerWidth-32)-16)),y:Math.max(96,Math.min(b.y,innerHeight-Math.min(b.h,innerHeight-152)-56))}));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 const move=(e:ReactPointerEvent)=>{const d=drag.current;if(!d)return;const west=d.corner.includes('w'),north=d.corner.includes('n');const w=Math.max(Math.min(320,innerWidth-32),Math.min(1280,west?d.box.x+d.box.w-16:innerWidth-d.box.x-16,d.box.w+(e.clientX-d.x)*(west?-1:1)));const h=Math.max(160,Math.min(720,north?d.box.y+d.box.h-96:innerHeight-d.box.y-56,d.box.h+(e.clientY-d.y)*(north?-1:1)));setBox({x:west?d.box.x+d.box.w-w:d.box.x,y:north?d.box.y+d.box.h-h:d.box.y,w,h});};
 return <dialog ref={ref} data-overlay data-select-popup className="prompt-fullscreen" data-phase={phase} inert={phase==='exit'} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
 <p className="prompt-screen-tip">💡Tips：支持按 esc 或点击空白处退出全屏输入框</p>
 <section className="prompt-expanded" style={{left:box.x,top:box.y,width:box.w}}><header><h2>{title}</h2><div className="prompt-expanded-header-actions">{expandedHeaderAction}<Button variant="tonal" aria-label="收起输入框" onClick={onClose}><Icon name="promptCollapse"/></Button></div></header>
 <div className="prompt-expanded-field" style={{height:box.h}}><textarea autoFocus aria-label={title} value={value} maxLength={maxLength} onChange={e=>onChange(e.target.value)}/><footer><div>{actions}</div><span className="prompt-expanded-assist">{expandedAction}<span>{value.length}/{maxLength}</span></span><Button variant="secondary" onClick={()=>onChange('')}>{clear}</Button></footer>
 {['nw','ne','sw','se'].map(c=><span key={c} className={`prompt-resize ${c}`} aria-hidden="true" onPointerDown={e=>{e.preventDefault();drag.current={x:e.clientX,y:e.clientY,box,corner:c};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}/>)}<img className="prompt-resize-mark" src="/assets/fusion/promptResize.svg" alt=""/></div></section></dialog>;
}
function PromptLibrary({phase,entries,maxLength,onStore,onApply,onClose}:{phase:'enter'|'exit';entries:Entry[];maxLength:number;onStore:(e:Entry[])=>Promise<PromptStoreResult>;onApply:(text:string,mode:'append'|'replace')=>void;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);useModal(ref);
 const {uploads,onUpload,locale}=usePromptLibrary();
 const [selected,setSelected]=useState(entries[0]?.id??'');
 const [query,setQuery]=useState('');
 const searchInputRef=useRef<HTMLInputElement>(null);
 const [draft,setDraft]=useState<Entry|null>(null);
 const [coverBusy,setCoverBusy]=useState(false);
 const [saving,setSaving]=useState(false);
 const [menu,setMenu]=useState<{entry:Entry;anchor:HTMLElement}|null>(null);
 const previousSelection=useRef(selected);
 const isNew=!!draft&&!entries.some(e=>e.id===draft.id);
 // Existing long entries remain editable and save intact from any workspace.
 const draftMaxLength=Math.max(maxLength,entries.find(entry=>entry.id===draft?.id)?.content.length??0);
 const sorted=[...entries].sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned));
 const listed=isNew?[draft!,...sorted]:sorted;
 const visible=listed.filter(e=>(e.name+' '+e.content).toLowerCase().includes(query.toLowerCase()));
 const current=visible.find(e=>e.id===selected)??visible[0];
 const activeId=draft?.id??current?.id;
 const isEmpty=visible.length===0&&!draft;
 const cancelDraft=()=>{if(isNew)setSelected(entries.some(e=>e.id===previousSelection.current)?previousSelection.current:(entries[0]?.id??''));setDraft(null);};
 const addPrompt=()=>{if(draft||saving)return;setQuery('');previousSelection.current=selected;const entry={id:crypto.randomUUID(),name:'',content:''};setDraft(entry);setSelected(entry.id);};
 useEffect(()=>{if(isNew){ref.current?.querySelector('nav')?.scrollTo({top:0});ref.current?.querySelector<HTMLInputElement>('[aria-label="编辑提示词名称"]')?.focus({preventScroll:true});}},[isNew]);
 const saveEntries=async(next:Entry[])=>{
   setSaving(true);
   try{const result=await onStore(next);if(!result.ok)notify(result.message,'error');return result.ok;}
   finally{setSaving(false);}
 };
 const commitDraft=async(saveAs=false)=>{
   if(!draft||!draft.name.trim()||!draft.content.trim()||coverBusy||saving)return;
   const name=draft.name.trim();
   const original=entries.find(entry=>entry.id===draft.id);
   // Preserve the existing 50-character title rule when creating an independent copy.
   const savedName=saveAs&&name===original?.name.trim()
     ? `${name.slice(0,47).replace(/[\uD800-\uDBFF]$/,'')}_副本`:name;
   const entry:Entry=saveAs
     ? {id:crypto.randomUUID(),name:savedName,content:draft.content,coverUrl:draft.coverUrl}
     : {...draft,name:savedName};
   const next=saveAs?[entry,...entries]:entries.some(e=>e.id===entry.id)
     ? entries.map(e=>e.id===entry.id?entry:e):[entry,...entries];
   if(!await saveEntries(next))return;
   setQuery('');setSelected(entry.id);setDraft(null);
   requestAnimationFrame(()=>ref.current?.querySelector('[data-selected="true"]')?.scrollIntoView({block:'nearest'}));
 };
 const removeEntry=async(id:string)=>{
   if(saving)return;
   const next=entries.filter(e=>e.id!==id);
   if(await saveEntries(next)){
     if(selected===id||draft?.id===id){setSelected([...next].sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned))[0]?.id??'');setDraft(null);}
     setMenu(null);
   }
 };
 const togglePin=async()=>{
   if(!menu||saving)return;
   const entry=entries.find(e=>e.id===menu.entry.id);if(!entry)return;
   const pinned=!entry.pinned;
   const updated={...entry,pinned};
   const rest=entries.filter(e=>e.id!==entry.id);
   const next=pinned?[updated,...rest]:[...rest.filter(e=>e.pinned),updated,...rest.filter(e=>!e.pinned)];
   if(await saveEntries(next)){
     if(draft?.id===entry.id)setDraft({...draft,pinned});
     setMenu(null);
     requestAnimationFrame(()=>ref.current?.querySelector('nav')?.scrollTo({top:0}));
     notify(pinned?'已置顶':'已取消置顶');
   }
 };
 const saveDisabled=coverBusy||saving||!draft?.name.trim()||!draft?.content.trim();
 return <dialog ref={ref} data-overlay data-select-popup className="prompt-library" data-phase={phase} inert={phase==='exit'} aria-label="提示词库" aria-busy={saving} onCancel={e=>{e.preventDefault();if(!saving)onClose();}}>
 <aside><header><div><h2>提示词库</h2><Button aria-label="新增提示词" disabled={!!draft||saving} onClick={addPrompt}><Icon name="cutoutPlus"/></Button></div>
 <div className="prompt-library-search" role="search"><Icon name="search"/><input ref={searchInputRef} aria-label="搜索提示词" placeholder="请输入关键词搜索" disabled={saving} value={query} onChange={e=>setQuery(e.target.value)}/>
 {query.length>0&&<Button className="prompt-library-search-clear" aria-label="清除搜索" disabled={saving} onClick={()=>{setQuery('');searchInputRef.current?.focus({preventScroll:true});}}><Icon name="promptSearchClear" size={20}/></Button>}
 </div></header>
 <nav>{visible.map(entry=><div className="prompt-list-card" key={entry.id} data-selected={activeId===entry.id}>
 <button className="prompt-card-select" disabled={saving} aria-pressed={activeId===entry.id} onClick={()=>{setSelected(entry.id);if(entry.id!==draft?.id)setDraft(null);}}>
   {entry.coverUrl&&<span className="prompt-list-cover"><img src={entry.coverUrl} alt=""/></span>}
   <span className="prompt-card-context"><strong>{entry.pinned&&<span className="prompt-pinned-tag">置顶</span>}<span className="prompt-card-title">{entry.name||'Untitled'}</span></strong><span className="prompt-card-description">{entry.content||'请输入提示词内容...'}</span></span>
 </button>
 {entries.some(e=>e.id===entry.id)&&<Button className="prompt-card-more" disabled={saving} aria-label={`更多 · ${entry.name||'Untitled'}`} title="更多" aria-haspopup="menu" aria-expanded={menu?.entry.id===entry.id} onClick={e=>setMenu(menu?.entry.id===entry.id?null:{entry,anchor:e.currentTarget})}><Icon name="promptMore" size={20}/></Button>}
 </div>)}{!visible.length&&entries.length>0&&<p className="prompt-empty">没有匹配的提示词</p>}</nav></aside>
 {menu&&<PromptCardMenu anchor={menu.anchor} pinned={!!menu.entry.pinned} onClose={()=>setMenu(null)} onPin={()=>void togglePin()} onDelete={()=>void removeEntry(menu.entry.id)}/>}
 <section className={isEmpty?'prompt-library-initial':undefined} data-node-id={isEmpty?'171:4333':undefined}>
 <header>{!isEmpty&&<h2>{isNew?'新增提示词':'提示词详情'}</h2>}<Button aria-label="关闭" disabled={saving} onClick={onClose}><Icon name="close"/></Button></header>
 <div className="prompt-library-body">{isEmpty?
   <div className="prompt-library-empty-state" data-node-id="171:4443"><div className="prompt-library-empty-content"><img src="/assets/prompts/empty-library.png" alt="" width={128} height={128}/><h3>暂无数据</h3><p>当前没有可展示的内容</p></div><Button variant="primary" size="s" onClick={addPrompt}>新增提示词</Button></div>
   :draft?<>
     <label><span>提示词标题 <em className="prompt-required">*</em></span><div className="prompt-edit-title"><input aria-label="编辑提示词名称" placeholder="请输入名称" required maxLength={50} disabled={saving} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/><span>{draft.name.length}/50</span></div></label>
     <div inert={saving}><PromptCoverField key={draft.id} value={draft.coverUrl} uploads={uploads} onUpload={onUpload} locale={locale} onBusy={setCoverBusy} onChange={coverUrl=>setDraft(currentDraft=>currentDraft?{...currentDraft,coverUrl}:null)}/></div>
     <label className="prompt-content-edit"><span>提示词内容 <em className="prompt-required">*</em></span><div className="prompt-edit-content"><textarea aria-label="编辑提示词内容" placeholder="请输入提示词内容..." required maxLength={draftMaxLength} disabled={saving} value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})}/><span>{draft.content.length}/{draftMaxLength}</span></div></label>
   </>:current?<div className="prompt-detail-card" data-node-id="111:5494"><h3>{current.name}</h3>{current.coverUrl&&<img className="prompt-detail-cover" src={current.coverUrl} alt={current.name}/>}<p className="prompt-detail-content">{current.content}</p></div>:<p className="prompt-empty">选择或新增一条提示词</p>}
 </div>
 {!isEmpty&&<footer>{draft?<>
   {!isNew&&<Button variant="outline" className="prompt-delete" size="m" disabled={saving} onClick={()=>void removeEntry(draft.id)}><Icon name="promptTrash" size={20}/>删除</Button>}
   <Button variant="secondary" size="m" disabled={saving} onClick={cancelDraft}>取消</Button>
   {!isNew&&<Button variant="secondary" size="m" disabled={saveDisabled} onClick={()=>void commitDraft(true)}>另存为</Button>}
   <Button variant="primary" size="m" disabled={saveDisabled} onClick={()=>void commitDraft()}>保存</Button>
 </>:<>
   <Button variant="outline" size="m" disabled={!current||saving} onClick={()=>{if(current){setSelected(current.id);setDraft(current);}}}><Icon name="promptEdit" size={20}/>编辑</Button>
   <Button variant="secondary" size="m" disabled={!current||saving} onClick={()=>{if(current)onApply(current.content,'append');}}>在已有输入后插入</Button>
   <Button variant="primary" size="m" disabled={!current||saving} onClick={()=>{if(current)onApply(current.content,'replace');}}>应用并覆盖原文</Button>
 </>}</footer>}</section></dialog>;
}

function PromptCardMenu({anchor,pinned,onClose,onPin,onDelete}:{anchor:HTMLElement;pinned:boolean;onClose:()=>void;onPin:()=>void;onDelete:()=>void}){
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
   const el=ref.current!;el.showPopover();
   const place=()=>{const r=anchor.getBoundingClientRect();el.style.left=`${Math.max(8,Math.min(r.right-el.offsetWidth,innerWidth-el.offsetWidth-8))}px`;el.style.top=`${r.bottom+4+el.offsetHeight>innerHeight-8?Math.max(8,r.top-el.offsetHeight-4):r.bottom+4}px`;};
   place();el.querySelector<HTMLElement>('[role="menuitem"]')?.focus({preventScroll:true});
   window.addEventListener('resize',place);document.addEventListener('scroll',place,true);
   return()=>{window.removeEventListener('resize',place);document.removeEventListener('scroll',place,true);};
 },[anchor]);
 return <div ref={ref} popover="auto" role="menu" aria-label="提示词操作" className="prompt-card-menu" onToggle={e=>{if(e.newState==='closed')onClose();}} onKeyDown={e=>{const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const i=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();anchor.focus({preventScroll:true});}}}>
 <button role="menuitem" onClick={()=>{onPin();anchor.focus({preventScroll:true});}}><Icon name="promptPin"/>{pinned?'取消置顶':'置顶'}</button>
 <button role="menuitem" onClick={onDelete}><Icon name="promptTrash"/>删除</button>
 </div>;
}

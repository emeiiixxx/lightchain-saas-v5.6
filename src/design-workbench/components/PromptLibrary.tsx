// Adapted from the v5.3 PromptTools component; v5.4 adds optional prompt covers.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Button, Icon, IconButton } from './ui';
import { useLocale } from '../LocaleContext';
import type { Notify } from '../notification';
import { PromptCoverField } from './PromptCoverField';
import './prompt-library.css';
import type { PromptStoreResult } from '../prompt-storage';
import type { LibraryImage } from '../asset-library';
export type PromptEntry = { id: string; name: string; content: string; pinned?: boolean; coverUrl?: string };
type Entry = PromptEntry;
export function SavePrompt({anchor,phase,onClose,onSave}:{anchor:HTMLElement;phase:'enter'|'exit';onClose:()=>void;onSave:(name:string)=>void|Promise<void>}){
 const { t } = useLocale();
 const ref=useRef<HTMLDivElement>(null);const [name,setName]=useState('');
 const saving=useRef(false);const [busy,setBusy]=useState(false);
 const save=async()=>{if(saving.current||!name.trim())return;saving.current=true;setBusy(true);try{await onSave(name.trim());}finally{saving.current=false;setBusy(false);}};
 useLayoutEffect(()=>{const el=ref.current!;el.showPopover();let frame=0;const place=()=>{const r=anchor.getBoundingClientRect();el.style.left=`${Math.max(8,Math.min(r.left,innerWidth-el.offsetWidth-8))}px`;el.style.top=`${Math.max(8,r.top-el.offsetHeight-8>=8?r.top-el.offsetHeight-8:Math.min(r.bottom+8,innerHeight-el.offsetHeight-8))}px`;frame=requestAnimationFrame(place);};place();el.querySelector('input')?.focus({preventScroll:true});return()=>cancelAnimationFrame(frame);},[anchor]);
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(e.target instanceof Node&&!ref.current?.contains(e.target)&&!anchor.contains(e.target))onClose();};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);},[anchor,onClose]);
 return <div ref={ref} popover="manual" data-overlay data-select-popup role="dialog" aria-label={t('保存提示词')} className="prompt-save-popover" data-phase={phase} inert={phase==='exit'} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();anchor.focus({preventScroll:true});}if(e.key==='Enter'&&!e.nativeEvent.isComposing&&name.trim()){e.preventDefault();void save();}}}>
 <header><h3>{t('保存提示词')}</h3><IconButton size="s" icon="close" aria-label={t('关闭')} onClick={onClose}/></header>
 <label className="prompt-name-input"><input aria-label={t('提示词名称')} placeholder={t('请输入名称')} value={name} maxLength={50} onChange={e=>setName(e.target.value)}/><span>{name.length}/50</span></label>
 <footer><Button variant="secondary" onClick={onClose}>{t('取消')}</Button><Button variant="primary" disabled={busy||!name.trim()} onClick={()=>void save()}>{t('保存')}</Button></footer></div>;
}
function useModal(ref:RefObject<HTMLDialogElement|null>){useEffect(()=>{const old=document.activeElement as HTMLElement|null;const el=ref.current!;el.showModal();return()=>{el.close();if(old?.isConnected)old.focus({preventScroll:true});};},[]);}
export function PromptLibrary({phase,entries,uploads,onUpload,onStore,onNotify:notify,onClose,onApply}:{phase:'enter'|'exit';entries:Entry[];uploads:LibraryImage[];onUpload:(image:LibraryImage)=>void;onStore:(e:Entry[])=>Promise<PromptStoreResult>;onNotify:Notify;onClose:()=>void;onApply?:(content:string,mode:'replace'|'append')=>void}){
 const { t } = useLocale();const ref=useRef<HTMLDialogElement>(null);useModal(ref);const [selected,setSelected]=useState(entries[0]?.id??'');const [query,setQuery]=useState('');const [draft,setDraft]=useState<Entry|null>(null);
 const [menu,setMenu]=useState<{entry:Entry;anchor:HTMLElement}|null>(null);
 const [coverBusy,setCoverBusy]=useState(false);
 const previousSelection=useRef(selected);
 useEffect(()=>{if(!selected&&entries.length&&!draft)setSelected(entries[0].id);},[selected,entries,draft]);
 const isNew=!!draft&&!entries.some(e=>e.id===draft.id);
 const cancelDraft=()=>{if(isNew)setSelected(entries.some(e=>e.id===previousSelection.current)?previousSelection.current:(entries[0]?.id??''));setDraft(null);};
 const addPrompt=()=>{setQuery('');if(isNew)return;previousSelection.current=selected;const entry={id:crypto.randomUUID(),name:'',content:''};setDraft(entry);setSelected(entry.id);};
 useEffect(()=>{if(isNew){ref.current?.querySelector('nav')?.scrollTo({top:0});ref.current?.querySelector<HTMLInputElement>('[data-prompt-name]')?.focus({preventScroll:true});}},[isNew]);
 const commitDraft=async(saveAs=false)=>{
   if(coverBusy||!draft||!draft.name.trim()||!draft.content.trim())return;
   const name=draft.name.trim();
   const original=entries.find(entry=>entry.id===draft.id);
   // Keep the automatic suffix inside the 50-character title limit.
   const savedName=saveAs&&name===original?.name.trim()
     ? `${name.slice(0,40).replace(/[\uD800-\uDBFF]$/,'')}${t('_副本')}`.slice(0,50):name;
   // Save As creates an independent text record without inheriting pin state.
   const entry:Entry=saveAs
     ? {id:crypto.randomUUID(),name:savedName,content:draft.content,coverUrl:draft.coverUrl}
     : {...draft,name:savedName};
   const next=saveAs?[entry,...entries]:entries.some(e=>e.id===entry.id)
     ? entries.map(e=>e.id===entry.id?entry:e):[entry,...entries];
   setCoverBusy(true);
   const result=await onStore(next);
   setCoverBusy(false);
   if(!result.ok){notify(result.message, 'error');return;}
   setQuery('');setSelected(entry.id);setDraft(null);
   requestAnimationFrame(()=>ref.current?.querySelector('[data-selected="true"]')?.scrollIntoView({block:'nearest'}));
 };

 const sorted=[...entries].sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned));
 const listed=isNew?[draft!,...sorted]:sorted;
 const removeEntry=async(id:string)=>{const next=entries.filter(e=>e.id!==id);const result=await onStore(next);if(!result.ok){notify(result.message, 'error');return;}if(result.ok){if(selected===id){setSelected([...next].sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned))[0]?.id??'');setDraft(null);}setMenu(null);}};
 const togglePin=async()=>{
   if(!menu)return;
   const entry=entries.find(e=>e.id===menu.entry.id);if(!entry)return;
   const pinned=!entry.pinned;
   const updated={...entry,pinned};
   // Most recently pinned goes first, including ahead of older pinned entries.
   const rest=entries.filter(e=>e.id!==entry.id);
   const next=pinned?[updated,...rest]:[...rest.filter(e=>e.pinned),updated,...rest.filter(e=>!e.pinned)];
   const result=await onStore(next);
   if(!result.ok){notify(result.message, 'error');return;}
   if(result.ok){
     if(draft?.id===entry.id)setDraft({...draft,pinned});
     setMenu(null);
     requestAnimationFrame(()=>ref.current?.querySelector('nav')?.scrollTo({top:0}));
     notify(pinned?'已置顶':'已取消置顶', 'success');
   }
 };
 const visible=listed.filter(e=>(e.name+' '+e.content).toLowerCase().includes(query.toLowerCase()));
 const current=visible.find(e=>e.id===selected)??visible[0];
 const activeId=draft?.id??current?.id;
 const isEmpty=visible.length===0&&!draft;
 return <dialog ref={ref} data-overlay data-select-popup className="prompt-library" data-phase={phase} inert={phase==='exit'} aria-label={t('提示词库')} onCancel={e=>{e.preventDefault();onClose();}}>
 <aside><header><div><h2>{t('提示词库')}</h2><IconButton size="m" icon="library-add" aria-label={t('新增提示词')} disabled={!!draft} onClick={addPrompt}/></div><label className="prompt-library-search"><Icon name="search"/><input aria-label={t('搜索提示词')} placeholder={t('请输入关键词搜索')} value={query} onChange={e=>{setQuery(e.target.value);setMenu(null);}}/></label></header>
 <nav>{visible.map(entry=><div className="prompt-list-card" key={entry.id} data-selected={activeId===entry.id}>
 <button className="prompt-card-select" aria-pressed={activeId===entry.id} onClick={()=>{setSelected(entry.id);if(entry.id!==draft?.id)setDraft(null);}}><>{entry.coverUrl&&<span className="prompt-list-cover"><img src={entry.coverUrl} alt=""/></span>}<span className="prompt-card-context"><strong>{entry.pinned&&<span className="prompt-pinned-tag">{t('置顶')}</span>}<span className="prompt-card-title">{entry.name||'Untitled'}</span></strong><p>{entry.content||t('请输入提示词内容...')}</p></span></></button>
 {entries.some(e=>e.id===entry.id)&&<IconButton size="xs" icon="library-promptMore" className="prompt-card-more" title={t("更多")} aria-label={`${t('更多操作')} · ${entry.name||'Untitled'}`} aria-haspopup="menu" aria-expanded={menu?.entry.id===entry.id} onClick={e=>setMenu(menu?.entry.id===entry.id?null:{entry,anchor:e.currentTarget})}/>}
 </div>)}{!visible.length&&entries.length>0&&<p className="prompt-empty">{t('没有匹配的提示词')}</p>}</nav></aside>
 {menu&&<PromptCardMenu anchor={menu.anchor} pinned={!!menu.entry.pinned} onClose={()=>setMenu(null)} onPin={togglePin} onDelete={()=>removeEntry(menu.entry.id)}/>}

 <section className={isEmpty?'prompt-library-initial':undefined} data-node-id={isEmpty?'77:6119':undefined}><header>{!isEmpty&&<h2>{isNew?t('新增提示词'):draft?t('编辑提示词'):t('提示词详情')}</h2>}<IconButton size="m" icon="close" aria-label={t('关闭')} onClick={onClose}/></header>
 <div className="prompt-library-body">{isEmpty?<div className="prompt-library-empty-state" data-node-id="77:6127"><div className="prompt-library-empty-content"><img src="/assets/design-workbench/prompt-library-empty.png" alt="" width={128} height={128}/><h3>{t('暂无数据')}</h3><p>{t('当前没有可展示的内容')}</p></div><Button variant="primary" size="s" onClick={addPrompt}>{t('新增提示词')}</Button></div>:draft?<><label><span>{t('提示词标题')}<em className="prompt-required">*</em></span><div className="prompt-edit-title"><input data-prompt-name aria-label={t('编辑提示词名称')} placeholder={t('请输入名称')} required maxLength={50} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/><span>{draft.name.length}/50</span></div></label><PromptCoverField key={draft.id} value={draft.coverUrl} uploads={uploads} onUpload={onUpload} onChange={coverUrl=>setDraft(previous=>previous?{...previous,coverUrl}:previous)} onBusy={setCoverBusy} onNotify={notify}/><label className="prompt-content-edit"><span>{t('提示词内容')}<em className="prompt-required">*</em></span><div className="prompt-edit-content"><textarea aria-label={t('编辑提示词内容')} placeholder={t('请输入提示词内容...')} required maxLength={2000} value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})}/><span>{draft.content.length}/2000</span></div></label></>:current?<><div className="prompt-detail-card"><h3>{current.name}</h3>{current.coverUrl&&<img className="prompt-detail-cover" src={current.coverUrl} alt={t("封面图")}/>}<p className="prompt-detail-content">{current.content}</p></div></>:<p className="prompt-empty">{t('选择或新增一条提示词')}</p>}</div>
 {!isEmpty&&<footer>{draft?<>{!isNew&&<Button variant="outline" className="prompt-delete" size="m" onClick={()=>removeEntry(draft.id)}><Icon name="library-promptTrash" size={20}/>{t('删除')}</Button>}<Button variant="secondary" size="m" onClick={cancelDraft}>{t('取消')}</Button>{!isNew&&<Button variant="secondary" size="m" disabled={coverBusy||!draft.name.trim()||!draft.content.trim()} onClick={()=>commitDraft(true)}>{t('另存为')}</Button>}<Button variant="primary" size="m" disabled={coverBusy||!draft.name.trim()||!draft.content.trim()} onClick={()=>commitDraft()}>{t('保存')}</Button></>:<><Button variant="outline" size="m" disabled={!current} onClick={()=>{if(current){setSelected(current.id);setDraft(current);}}}><Icon name="library-promptEdit" size={20}/>{t('编辑')}</Button>{onApply?<><Button variant="secondary" size="m" disabled={!current} onClick={()=>{if(current)onApply(current.content,'append');}}>{t('在已有输入后插入')}</Button><Button variant="primary" size="m" disabled={!current} onClick={()=>{if(current)onApply(current.content,'replace');}}>{t('应用并覆盖原文')}</Button></>:<Button variant="primary" size="m" disabled={!current} onClick={async()=>{if(!current)return;try{await navigator.clipboard.writeText(current.content);notify("提示词已复制", 'success');}catch{notify("复制失败，请重试", 'error');}}}><Icon name="generation-record-imgLeftIcon2" size={20}/>{t("复制提示词")}</Button>}</>}</footer>}</section></dialog>;
}

function PromptCardMenu({anchor,pinned,onClose,onPin,onDelete}:{anchor:HTMLElement;pinned:boolean;onClose:()=>void;onPin:()=>void;onDelete:()=>void}){
 const { t } = useLocale();
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
   const el=ref.current!;el.showPopover();
   const place=()=>{const r=anchor.getBoundingClientRect();el.style.left=`${Math.max(8,Math.min(r.right-el.offsetWidth,innerWidth-el.offsetWidth-8))}px`;el.style.top=`${r.bottom+4+el.offsetHeight>innerHeight-8?Math.max(8,r.top-el.offsetHeight-4):r.bottom+4}px`;};
   place();el.querySelector<HTMLElement>('[role="menuitem"]')?.focus({preventScroll:true});
   window.addEventListener('resize',place);document.addEventListener('scroll',place,true);
   return()=>{window.removeEventListener('resize',place);document.removeEventListener('scroll',place,true);};
 },[anchor]);
 return <div ref={ref} popover="auto" role="menu" aria-label={t('提示词操作')} className="prompt-card-menu" onToggle={e=>{if(e.newState==='closed')onClose();}} onKeyDown={e=>{const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const i=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();anchor.focus({preventScroll:true});}}}>
 <button role="menuitem" onClick={()=>{onPin();anchor.focus({preventScroll:true});}}><Icon name="library-promptPin"/>{pinned?t('取消置顶'):t('置顶')}</button>
 <button role="menuitem" onClick={onDelete}><Icon name="library-promptTrash"/>{t('删除')}</button>
 </div>;
}

import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';
export const time=(s?:string)=>s?new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未记录';
export const stateText={supported:'原文支持',clue:'检索线索',missing:'待补资料',conflict:'存在冲突',unpublished:'未公布'};
export async function api<T>(url:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch('/api'+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'操作未完成');return data;
}
export function Dialog({title,children,onClose,wide=false,drawer=false}:{title:string;children:React.ReactNode;onClose:()=>void;wide?:boolean;drawer?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const dialog=ref.current;dialog?.showModal();return()=>{dialog?.close();if(previous?.isConnected)previous.focus();};},[]);
 return <dialog ref={ref} className={'dialog'+(wide?' wide':'')+(drawer?' drawer':'')} aria-label={title} onCancel={event=>{event.preventDefault();onClose();}}>
  <header className="dialog-header"><h2>{title}</h2><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><X size={21}/></button></header><div className="dialog-body">{children}</div>
 </dialog>;
}

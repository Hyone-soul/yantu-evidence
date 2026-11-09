export const SCHOOLS=[
 {id:'bupt',name:'北京邮电大学',short:'北邮',region:'北京',domains:['bupt.edu.cn'],seeds:['https://yz.chsi.com.cn/zsgs/zsjz/detail.action?schCode=10013&zsgsId=3549248502','https://yzb.bupt.edu.cn/']},
 {id:'uestc',name:'电子科技大学',short:'成电',region:'四川',domains:['uestc.edu.cn'],seeds:['https://yzbm.uestc.edu.cn/zsml/sszsml/index/2027','https://yz.uestc.edu.cn/sszs/zsjz.htm']},
 {id:'hdu',name:'杭州电子科技大学',short:'杭电',region:'浙江',domains:['hdu.edu.cn'],seeds:['https://grs.hdu.edu.cn/2026/0929/c13497a301001/page.htm','https://grs.hdu.edu.cn/2026/0928/c13497a300811/page.htm']},
 {id:'njupt',name:'南京邮电大学',short:'南邮',region:'江苏',domains:['njupt.edu.cn'],seeds:['https://yzb.njupt.edu.cn/2026/0930/c7795a309245/page.htm','https://yzb.njupt.edu.cn/7795/list.htm']},
 {id:'ccut',name:'长春工业大学',short:'长春工大',region:'吉林',domains:['ccut.edu.cn'],seeds:['https://yjsy.ccut.edu.cn/info/1141/3476.htm','https://yjsy.ccut.edu.cn/info/1141/3453.htm']},
 {id:'btbu',name:'北京工商大学',short:'北工商',region:'北京',domains:['btbu.edu.cn'],seeds:['https://yzb.btbu.edu.cn/sszs/7f4c2604e05d4e42af863b008ec7f8cf.htm','https://yzb.btbu.edu.cn/sszs/c1be3e9d3058422da443aee2c6bb809e.htm','https://yzb.btbu.edu.cn/sszs/33427e8236ce485ab7bad55c9a337e8f.htm']}
];
export const SPECIALTIES=[{code:'081200',name:'计算机科学与技术'},{code:'085404',name:'计算机技术'},{code:'083500',name:'软件工程'},{code:'085405',name:'软件工程'},{code:'085410',name:'人工智能'},{code:'085412',name:'网络与信息安全'}];
export function school(id:string){const s=SCHOOLS.find(s=>s.id===id);if(!s)throw new Error('未知院校');return s;}
export function ownedHost(host:string,schoolId:string){return school(schoolId).domains.some(d=>host===d||host.endsWith('.'+d))||host==='yz.chsi.com.cn';}

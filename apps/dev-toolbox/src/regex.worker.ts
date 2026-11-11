self.onmessage=(event:MessageEvent<{pattern:string;flags:string;text:string}>)=>{
 try{
  const {pattern,flags,text}=event.data;if(pattern.length>5000||text.length>200000)throw new Error('Limit patterns to 5,000 characters and input to 200,000 characters.');
  const regex=new RegExp(pattern,flags),results:{match:string;index:number;groups:(string|null)[];named:Record<string,string>|null}[]=[];
  let match:RegExpExecArray|null;
  while((match=regex.exec(text))!==null){results.push({match:match[0],index:match.index,groups:match.slice(1).map(value=>value??null),named:match.groups??null});if(!regex.global||results.length>=1000)break;if(match[0]===''){const index=regex.lastIndex;if((regex.unicode||flags.includes('v'))&&index<text.length&&/^[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(text.slice(index,index+2)))regex.lastIndex+=2;else regex.lastIndex++;}}
  self.postMessage({ok:true,results,truncated:results.length>=1000});
 }catch(error){self.postMessage({ok:false,error:error instanceof Error?error.message:'Invalid regular expression'});}
};

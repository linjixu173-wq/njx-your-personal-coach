import * as coach from '../app/api/coach/route';
import * as photos from '../app/api/photos/route';
import * as photo from '../app/api/photos/[id]/route';
export default {async fetch(request:Request){
  const url=new URL(request.url);if(url.pathname==='/api/coach')return request.method==='GET'?coach.GET(request):coach.POST(request);
  if(url.pathname==='/api/photos')return photos.POST(request);
  const match=url.pathname.match(/^\/api\/photos\/([^/]+)$/);if(match){const ctx={params:Promise.resolve({id:match[1]})};return request.method==='DELETE'?photo.DELETE(request,ctx):photo.GET(request,ctx);}
  return new Response('not found',{status:404});
}};

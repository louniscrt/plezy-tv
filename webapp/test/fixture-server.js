// Serveurs de démonstration des contrats API, sans compte ni serveur personnel.
// Usage de développement : node webapp/test/fixture-server.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const film = {Id:'fixture-movie',Name:'Film de validation',Type:'Movie',ProductionYear:2025,Overview:'Fiche issue du serveur de test Jellyfin.',Genres:['Drame'],CommunityRating:8.4,ImageTags:{Primary:'test'},BackdropImageTags:['test'],RunTimeTicks:7340000000,UserData:{Played:false},MediaSources:[{Id:'source-1',Container:'mp4',MediaStreams:[{Type:'Video',Codec:'h264'},{Type:'Audio',Codec:'aac',Index:1,DisplayTitle:'Français · AAC'}]}]};
const series={...film,Id:'fixture-series',Name:'Série de validation',Type:'Series'};
const media={id:42,mediaType:'movie',title:'Découverte de validation',overview:'Fiche issue du serveur de test Seerr.',releaseDate:'2025-01-01',voteAverage:7.2,mediaInfo:{status:1}};
const state={requested:false,played:false,favorite:false};
const server=http.createServer(async(req,res)=>{
 let body='';for await(const c of req)body+=c;
 const url=new URL(req.url,'http://fixture'), p=url.pathname;
 const send = (data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
 if(p.includes('/Images/')) {res.writeHead(200,{'content-type':'image/jpeg'});return fs.createReadStream(path.join(__dirname,'../public/art/demo-4.jpg')).pipe(res);}
 if(p==='/Users/AuthenticateByName'||p==='/Users/AuthenticateWithQuickConnect')return send({AccessToken:'fixture-token',User:{Id:'fixture-user',Name:'Validation'}});
 if(p.endsWith('/PlaybackInfo'))return send({PlaySessionId:'fixture-session',MediaSources:[{...film.MediaSources[0],SupportsDirectPlay:true,DirectStreamUrl:'/Videos/fixture-movie/stream.mp4?Static=true'}]});
 if(p==='/QuickConnect/Initiate')return send({Code:'123456',Secret:'fixture-secret'});
 if(p==='/QuickConnect/Connect')return send({Authenticated:true});
 if(p.includes('/FavoriteItems/')) {state.favorite=req.method==='POST';return send({});}
 if(p.includes('/PlayedItems/')) {state.played=req.method==='POST';return send({});}
 if(p==='/Users/fixture-user/Items/fixture-movie')return send({...film,UserData:{Played:state.played,IsFavorite:state.favorite}});
 if(p==='/Users/fixture-user/Items/fixture-series')return send(series);
 if(p.endsWith('/Items/Resume'))return send({Items:[]});
 if(p==='/Users/fixture-user/Items')return send({Items:url.searchParams.has('AnyProviderIdEquals')?[]:url.searchParams.get('IncludeItemTypes')==='Series'?[series]:[film]});
 if(p==='/Shows/fixture-series/Seasons')return send({Items:[{Id:'season-1',Name:'Saison 1'}]});
 if(p==='/Shows/fixture-series/Episodes')return send({Items:[{...film,Id:'episode-1',Type:'Episode',SeriesName:series.Name,IndexNumber:1,ParentIndexNumber:1}]});
 if(p.startsWith('/Sessions/Playing'))return send({});
 if(p.startsWith('/Videos/')){res.writeHead(302,{location:'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov'});return res.end();}
 if(p==='/api/v1/auth/me')return send({id:1,displayName:'Validation'});
 if(p==='/api/v1/auth/local'){res.setHeader('set-cookie','connect.sid=fixture-session; HttpOnly');return send({id:1});}
 if(p==='/api/v1/request'){state.requested=true;return send({id:99,status:1});}
 if(p.startsWith('/api/v1/movie/'))return send({...media,mediaInfo:{status:state.requested?2:1}});
 if(p.startsWith('/api/v1/'))return send({results:[{...media,mediaInfo:{status:state.requested?2:1}}]});
 send({message:'Route inconnue : '+p},404);
});
server.listen(8091,'127.0.0.1',()=>console.log('API de test sur http://127.0.0.1:8091'));

import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import {Alert, AppState, BackHandler, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {WebView} from '@amazon-devices/webview';
import {useHideSplashScreenCallback, usePreventHideSplashScreen} from '@amazon-devices/react-native-kepler';
import injection from './injection.json';
import {origin, televisionUrl, isTelevisionPage, isDocumentError, retryUrl} from './navigation';

const LAUNCHER = 'file:///pkg/assets/launcher.html';
const DEFAULT_SERVER = 'http://192.168.0.89:8081/';
// Dedicated presentation, same origin and storage as the existing TV session.
const isLauncher = (url: string) => url === LAUNCHER || url === LAUNCHER + '#settings';

export const App = () => {
  const web = useRef<any>(null);
  const [server,setServer] = useState(DEFAULT_SERVER);
  const [uri,setUri] = useState(LAUNCHER);
  const retrySerial = useRef(0);
  const [error,setError] = useState('');
  const [focused,setFocused] = useState('retry');
  const hideSplash = useHideSplashScreenCallback();
  usePreventHideSplashScreen();
  useEffect(() => {
    if (uri !== LAUNCHER) return;
    // A page script can run before Vega's message bridge is ready. Never leave
    // the startup screen waiting indefinitely for that initial message.
    const timeout = setTimeout(() => {
      console.info('[PlezyTV] launcher timeout: opening default server');
      setUri(televisionUrl(DEFAULT_SERVER));
    },8000);
    return () => clearTimeout(timeout);
  },[uri]);
  useEffect(() => {
    const timer = setTimeout(() => hideSplash(),1200);
    const subscription = AppState.addEventListener('change',state => {
      if (state !== 'active') web.current?.injectJavaScript("window.PlezyTV?.media('pause');true;");
    });
    return () => {clearTimeout(timer); subscription.remove();};
  },[hideSplash]);
  function exit() {
    Alert.alert('Quitter Plezy TV ?','',[
      {text:'Rester',style:'cancel'},
      {text:'Quitter',onPress:() => BackHandler.exitApp()},
    ]);
  }
  function configure() {setError(''); setUri(LAUNCHER+'#settings');}
  function reload() {
    setError(''); setUri(retryUrl(server, ++retrySerial.current));
    // Change only the source URI. Keep Vega's single renderer instance alive;
    // neither remount the WebView nor race this navigation with reload().
  }
  return <View style={styles.root}>
    <WebView ref={web} style={styles.web} source={{uri}}
      // Vega WebView delivers D-pad and Enter directly to the focused page.
      // Do not reinject keys through useTVEventHandler: that would duplicate them.
      hasTVPreferredFocus={!error} javaScriptEnabled domStorageEnabled
      allowSystemKeyEvents allowsDefaultMediaControl
      mediaPlaybackRequiresUserAction={false} allowFileAccess={false}
      onLoad={({nativeEvent}) => {
        hideSplash();
        if (isLauncher(nativeEvent.url)) {
          console.info('[PlezyTV] local launcher loaded');
          web.current?.injectJavaScript('window.PlezyLauncher?.start();true;');
        } else if (isTelevisionPage(nativeEvent.url, server)) {
          console.info('[PlezyTV] server page loaded');
          web.current?.injectJavaScript(injection);
        }
      }}
      onShouldStartLoadWithRequest={request => {
        if (request.url === 'plezytv://settings') {configure(); return false;}
        if (isLauncher(request.url) || origin(request.url) === origin(server)) return true;
        if (/^https?:\/\//i.test(request.url)) Linking.openURL(request.url).catch(() => Alert.alert('Lien indisponible','Aucune application ne peut ouvrir ce lien.'));
        return false;
      }}
      onMessage={({nativeEvent}) => {
        try {
          const message = JSON.parse(nativeEvent.data);
          // Some Vega firmware versions omit url from message events. The
          // requested source is trusted here: other page navigations are blocked.
          const sender = nativeEvent.url || uri;
          if (isLauncher(sender) && message.type === 'open-server' && typeof message.url === 'string' && origin(message.url)) {
            console.info('[PlezyTV] launcher address received');
            setServer(message.url); setError(''); setUri(televisionUrl(message.url));
          } else if (isTelevisionPage(sender, server)) {
            if (message.type === 'exit') exit();
            else if (message.type === 'invalid-app') setError('Cette adresse ne fournit pas Plezy Web. Utilisez le port 8081, puis connectez Jellyfin dans Plezy.');
            else if (message.type === 'ready') {setError('');console.info('[PlezyTV] TV interface ready; session='+(message.session===true)+'; refresh='+(message.refresh===120000?'120000':'unavailable'));}
            else if (message.type === 'library-refreshed') console.info('[PlezyTV] library refreshed');
          }
        } catch { /* Ignore malformed messages. No native fetch or arbitrary command bridge. */ }
      }}
      onError={({nativeEvent}) => {
        if (isDocumentError(nativeEvent, uri)) {hideSplash();setError('Serveur Plezy inaccessible. Vérifiez le réseau de la TV et le conteneur Plezy.');}
      }}
      onHttpError={({nativeEvent}) => {
        if (isDocumentError(nativeEvent, uri)) {hideSplash();setError('Le serveur Plezy renvoie une erreur HTTP '+nativeEvent.statusCode+'.');}
      }}
    />
    {!!error && <View style={styles.error}>
      <Text style={styles.brand}>PLEZY TV</Text><Text style={styles.message}>{error}</Text>
      <Pressable hasTVPreferredFocus onFocus={() => setFocused('retry')} style={[styles.button,focused === 'retry' && styles.focus]} onPress={reload}><Text style={styles.label}>Réessayer</Text></Pressable>
      <Pressable onFocus={() => setFocused('address')} style={[styles.button,focused === 'address' && styles.focus]} onPress={configure}><Text style={styles.label}>Adresse de Plezy Web</Text></Pressable>
    </View>}
  </View>;
};
const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:'#080808'},web:{flex:1,backgroundColor:'#080808'},
  error:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'#080808',padding:48,justifyContent:'center'},
  brand:{fontSize:32,fontWeight:'800',color:'#e50914',marginBottom:20},
  message:{fontSize:22,color:'#eee',marginBottom:22},
  button:{padding:18,borderRadius:14,backgroundColor:'#202020',borderWidth:2,borderColor:'#353535',marginTop:16},
  focus:{borderColor:'#fff',backgroundColor:'#383838'},label:{fontSize:20,color:'#fff'},
});

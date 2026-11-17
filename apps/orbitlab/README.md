# tenkyu Rest Lab

Bangle.js 2の独立した診断アプリです。[自用App Loader](https://onisy.github.io/BangleApps/?id=orbitlab&dev_id=BANGLEJS2)で時計に接続し、**tenkyu Rest Lab** をインストールします。tenkyu本体の更新は不要です。

1. 時計で **Rest Lab** を開き、必要なら **Save test profile** で閾値ファイルを作成します。
2. **HRM continuous** と **Minutes** を選び、**Start recording** を押します。
3. **Stop** で停止するか、指定時間で自動停止します。**App Loader → More… → Utilities → Backup** のZIPを開き、`storage-files` 内の同じ計測回の `orbitlab-…-raw.csv` と `orbitlab-…-out.csv` を、[グラフページ](https://onisy.github.io/BangleApps/apps/orbitlab/graph.html)をブラウザで開き、選択します。グラフページはファイル内容を端末内で処理します。

## 記録

- **raw CSV** は時刻、3軸加速度[g]、BPM、心拍信頼度[%]、充電状態と開始時の設定を保持します。加速度は時計から届いた各イベントを保存します。心拍イベントが出ない間は空白です。
- **out CSV** はtenkyuと同じ判定処理を通した5分枠ごとの結果です。安静度、非装着、測定失敗、データ不足、充電を記録します。3D drift、補正前後の積算、ピーク数、観測時間、心拍の結果と判定理由も含みます。後から同じ枠の判定が更新された場合は末尾に追記し、グラフでは最新の行を使用します。終了時の未完了枠は確定しません。
- **HRM continuous** はテスト中に光学心拍センサーを連続で動かします。連続測定で得た心拍イベントを判定器にも渡します。オフではtenkyuと同じ間欠測定を行い、他アプリが動かしている心拍センサーのイベントも記録します。連続測定は電力消費が増えるため、まず短時間で試せます。
- 開始後は時計の記録画面を開いたままにします。別アプリへの切り替え、時間満了、空き容量が128 KiBを下回った場合に停止します。過去の計測回のCSVは自動で消去しません。

## 設定の共用

`orbit.restcfg.json` は時計のストレージ上の別ファイルです。Rest Labは開始時に読み込み、キーがなければ既存のtenkyu設定を使います。tenkyu v0.113の **Settings → Rest graph → Import test profile** で、同じJSONを手動で取り込みます。取り込み後は現在のtenkyu設定として保存されます。既存ログは書き換えません。

公開中のv0.112でこのメニューを試すには、別途、下記の手動更新が必要です。診断アプリの導入だけなら不要です。

1. App Loaderで時計をバックアップします。
2. MacのChromeまたはEdgeで[Espruino Web IDE](https://www.espruino.com/ide/)を開き、Bangleを接続します。Storageファイルのアップロード機能で、手動更新パッケージ内の `tenkyu-update/orbit.rest` と `tenkyu-update/orbit.settings.js` を、それぞれ同じファイル名でアップロードします。時計の再起動後にtenkyu設定の **Rest graph → Import test profile** から取り込みます。
3. JSONを編集した場合も同じ方法で `orbit.restcfg.json` として書き込めます。

変更したいキーだけ指定できます。例の `restWearThreshold` は、画面の **Non-wear → 3D drift** に対応します。

```json
{
  "restWearThreshold": 0.081,
  "restProbeSeconds": 30,
  "restPulseConfidence": 90
}
```

判定はtenkyuの現行条件を再現します。安静3などでは、連続モードで心拍を記録していても非装着の判定に進まないことがあります。

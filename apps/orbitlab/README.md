# tenkyu Rest Lab v0.05

Bangle.js 2の独立診断アプリです。[自用App Loader](https://onisy.github.io/BangleApps/?id=orbitlab&dev_id=BANGLEJS2)からインストールできます。tenkyu v0.116と同じ安静・非装着判定を使います。

1. Rest Labを開き、HRM continuous、Minutesを選び、Start recordingで開始します。
2. Stop、時間満了、アプリ終了、空き容量128 KiB未満で停止します。
3. App LoaderのBackup ZIPから同じ計測回のraw/out CSVを取り出し、[グラフページ](https://onisy.github.io/BangleApps/apps/orbitlab/graph.html)で選択します。ファイルはブラウザ内で処理します。

- raw CSV：各加速度イベント、心拍イベント、充電状態、開始時の正規化済み設定。
- out CSV：新しい判定器の5分結果と診断値。最後の未完了枠は `partial_unconfirmed` で保存します。
- cmp CSV：約10秒ごとの60秒窓状態。既存CSVは保持し、自動削除しません。

グラフの上段はCSVに記録済みの5分判定、下段は新しい60秒方式による再計算です。旧版CSVの上段は当時の判定のままです。60秒方式は10秒ごとの更新で、時計の4秒タイマーによるcmp記録時刻とは数秒異なる場合があります。

心拍連続測定はテスト用で消費電力が増えます。オフならtenkyuと同じ間欠プローブを実行し、他アプリの心拍イベントも利用します。どちらでも非常に静かな加速度条件を満たせば、心拍イベントがない場合も非装着を推定します。心拍電源エラーは別に扱います。

設定は `orbit.restcfg.json` に置けます。Save test profileは既存ファイルを上書きしません。tenkyu v0.116のRest graph → Import test profileで同じ設定を取り込めます。

```json
{
  "restThreshold": 0.003,
  "restActivityT1": 0.1,
  "restActivityT2": 3,
  "restActivityT3": 60,
  "restActivityT4": 200,
  "restActivityT5": 500,
  "restScaleVersion": 6,
  "restWearNoiseG": 0.030,
  "restWearDriftG": 0.025,
  "restQuietNoiseG": 0.012,
  "restQuietDriftG": 0.012,
  "restAbsentRatio": 0.10,
  "restPulseConfidence": 90,
  "restProbeSeconds": 30
}
```

[判定条件の詳細](../orbit/REST.md)。本版の閾値は3回の記録に基づくもので、装着したまま完全静止する場合などの未知条件で誤判定する可能性が残ります。

安静度は0〜5の6段階です。5＝夜の睡眠相当、4＝居眠り・腕を机に置く、3＝集中したデスクワーク、2＝日常生活活動、1＝歩行・階段、0＝走行・運動を目安とします。旧CSVの5段階表記は維持します。

v0.05ではtenkyuと同じ5Hz処理・非装着中の積算休止を使用します。raw CSVは届いたイベントを全件保持します。out CSVの `activity_coverage_s` は積算した秒数、`paused_s` は休止秒数です。`drift_g` は新しい記録ではPose RMSです。cmp CSVは別の判定器を動かさず、本体判定器の60秒窓を記録します。従来同様、rawデータの連続保存とHRM continuousは検証用で、通常の時計動作より電力を使います。

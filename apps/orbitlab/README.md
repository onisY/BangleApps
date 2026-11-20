# tenkyu Rest Lab v0.07

Bangle.js 2の独立診断アプリです。[自用App Loader](https://onisy.github.io/BangleApps/?id=orbitlab&dev_id=BANGLEJS2)からインストールできます。tenkyu v0.117と同じ安静・非装着判定を使います。

1. Rest Labを開き、HRM continuous、Minutesを選び、Start recordingで開始します。
2. Stop、時間満了、アプリ終了、空き容量128 KiB未満で停止します。
3. App LoaderのBackup ZIPから同じ計測回のraw/out CSVを取り出し、[グラフページ](https://onisy.github.io/BangleApps/apps/orbitlab/graph.html)で選択します。ファイルはブラウザ内で処理します。

- raw CSVには、各加速度イベント、心拍イベント、充電状態、共通設定、気圧センサーの温度（`temperature_c`）を書き込みます。`probe` 行は電源を確保して終えた心拍測定の開始時刻、`hr_error` 行は電源エラーの有無、`check` 行は時計の判定時刻と理由を `event_value` に記録します。
- out CSVには5分ごとの安静度0〜5、非装着、充電の判定、理由、直近の温度、変化率、温度の観測時刻を保存します。最後の未完了枠は `partial_unconfirmed` です。
- cmp CSVには約10秒ごとの状態、3軸の揺れと姿勢のRMS、心拍信頼度の集計、温度、符号付き変化率（℃/分）、基準傾向からのずれ（℃）、判定理由を保存します。

グラフは同じ時間軸に加速度・心拍信頼度・安静度・装着状態・温度・変化率を表示します。揺れ、姿勢、温度の閾値を変えると、生データから装着状態を再計算します。上段の5分結果は時計が記録したものです。温度を記録していない旧版のCSVも旧版用の判定器で読み込めます。

HRM continuousをオフにすると、時計と同じ間欠測定を行います。オンにすると記録中はRest Labの心拍電源要求を維持します。記録終了時にはRest Labが確保した電源要求を解放します。tenkyuと同時に温度を要求した場合は進行中の測定を共有します。Labの装着履歴は計測回ごとに開始します。

**Save test profile** は `orbit.restcfg.json` を作成します。既存ファイルがある場合はその設定を使います。温度変化量の下限は `restTempDeltaC`（初期0.20℃）です。tenkyuでは **Rest graph → Import test profile** から同じ設定を取り込めます。[判定条件の詳細](../orbit/REST.md)

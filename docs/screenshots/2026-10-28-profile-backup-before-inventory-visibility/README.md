# Проверенные кадры до уточнения recovery-состояний

Из build `cbe5560382d4eb76b708f788500997c277f8fb98`, tests `7f88866a8a1f27dfc4e55e0da67e4bddf1ff0dec`: **12/12 targeted browser cases прошли**, 12 PNG, все восемь manifests captured, zero pageerror/horizontal overflow. Ошибка фонового чтения WebKit больше не повторилась; отдельный controlled scenario прошёл 3/3 без retry.

При визуальном просмотре desktop complete/partial выявлены прежние inventory counts в формах под результатом операции. Пока обычные workspaces paused, эти counts описывали состояние до restore и могли создать неверное впечатление о данных. `ccbc688` убирает export/restore формы до явного Open restored profile, где inventory строится заново; browser regression проверяет отсутствие старых форм и реальные counts после reopen. Данные/история не переписывались ради визуального исправления.

Кадры сохранены как evidence этой итерации; финальные captures нового UI хранятся отдельно. Это original test fixtures, не пользовательские архивы и не final owner visual approval.

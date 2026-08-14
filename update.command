#!/bin/bash
cd "$(dirname "$0")"
./update.sh
read -n 1 -s -r -p "按任意键关闭窗口..."
echo

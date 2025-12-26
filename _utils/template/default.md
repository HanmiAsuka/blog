<%* 
let title = tp.file.title;
title = title.replace(/-/g, ' '); // 把横线变空格
title = title.replace(/\b\w/g, c => c.toUpperCase()); // 首字母大写
%>
+++
title= "<% title %>"
date= <% tp.file.creation_date("YYYY-MM-DD[T]HH:mm:ss+08:00") %>
draft= false
+++

from django import template

register = template.Library()
# 600px es lo recomendado
@register.filter
def cloudinary_transform(url, params="w_300,h_300,c_fill,f_auto,q_auto"):
    if not url:
        return ""
    parts = url.split("/upload/")
    if len(parts) != 2:
        return url
    return parts[0] + "/upload/" + params + "/" + parts[1]
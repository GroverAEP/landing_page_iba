from django import template

register = template.Library()

@register.filter
def cloudinary_transform(url, params="w_650,h_650,c_fill,f_auto,q_auto"):
    if not url:
        return ""
    parts = url.split("/upload/")
    if len(parts) != 2:
        return url
    return parts[0] + "/upload/" + params + "/" + parts[1]